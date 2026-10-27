#include "SCCityGenerator.h"
#include "SCDestination.h"
#include "ShiftCityCore.h"
#include "Components/HierarchicalInstancedStaticMeshComponent.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "Materials/MaterialInterface.h"
#include "ProceduralMeshComponent.h"

#include "SCCityLayout.h"

namespace SC
{
	/** Geometry for one material section. Quads are emitted with both windings, so faces are visible
	 *  whichever handedness the engine expects; the supplied normal is the lit (outside) side. */
	struct FBuf
	{
		TArray<FVector> V; TArray<int32> T; TArray<FVector> N; TArray<FVector2D> UV; TArray<FProcMeshTangent> Tan; TArray<FColor> Col;
		FColor Tint = FColor::White; // per-building colour variation (materials multiply by vertex colour)
		void Quad(const FVector& A, const FVector& B, const FVector& C, const FVector& D, const FVector2D UVs[4], const FVector& Normal)
		{
			const int32 I = V.Num();
			V.Append({ A, B, C, D });
			UV.Append({ UVs[0], UVs[1], UVs[2], UVs[3] });
			Col.Append({ Tint, Tint, Tint, Tint });
			const FVector Tg = (B - A).GetSafeNormal();
			for (int32 k = 0; k < 4; ++k) { N.Add(Normal); Tan.Add(FProcMeshTangent(Tg, false)); }
			T.Append({ I, I + 1, I + 2, I, I + 2, I + 3 });
			T.Append({ I, I + 2, I + 1, I, I + 3, I + 2 });
		}
		/** Horizontal rectangle with planar UVs (Scale = cm per texture tile). */
		void Flat(float X0, float Y0, float X1, float Y1, float Z, float Scale)
		{
			const FVector2D Uv[4] = { { X0 / Scale, Y0 / Scale }, { X1 / Scale, Y0 / Scale }, { X1 / Scale, Y1 / Scale }, { X0 / Scale, Y1 / Scale } };
			Quad(FVector(X0, Y0, Z), FVector(X1, Y0, Z), FVector(X1, Y1, Z), FVector(X0, Y1, Z), Uv, FVector::UpVector);
		}
		/** Vertical wall from A to B (ground plan), outward normal Nrm. One tile = Bay x Floor cm. */
		void Wall(const FVector2D& A, const FVector2D& B, float Z0, float Z1, const FVector& Nrm, float UOff, float Bay, float Floor)
		{
			const float Len = FVector2D::Distance(A, B);
			const float U1 = UOff + FMath::Max(1, FMath::RoundToInt(Len / Bay));
			const float V0 = -Z0 / Floor, V1 = -Z1 / Floor; // texture V runs downwards in Unreal
			const FVector2D Uv[4] = { { UOff, V0 }, { U1, V0 }, { U1, V1 }, { UOff, V1 } };
			Quad(FVector(A, Z0), FVector(B, Z0), FVector(B, Z1), FVector(A, Z1), Uv, Nrm);
		}
		void Box(float X0, float Y0, float X1, float Y1, float Z0, float Z1, float UOff, float Bay, float Floor)
		{
			Wall({ X0, Y1 }, { X1, Y1 }, Z0, Z1, FVector(0, 1, 0), UOff, Bay, Floor);
			Wall({ X1, Y1 }, { X1, Y0 }, Z0, Z1, FVector(1, 0, 0), UOff, Bay, Floor);
			Wall({ X1, Y0 }, { X0, Y0 }, Z0, Z1, FVector(0, -1, 0), UOff, Bay, Floor);
			Wall({ X0, Y0 }, { X0, Y1 }, Z0, Z1, FVector(-1, 0, 0), UOff, Bay, Floor);
		}
	};
}

ASCCityGenerator::ASCCityGenerator()
{
	PrimaryActorTick.bCanEverTick = false;
	Mesh = CreateDefaultSubobject<UProceduralMeshComponent>(TEXT("CityMesh"));
	RootComponent = Mesh;
	Mesh->bUseComplexAsSimpleCollision = true;
	Mesh->SetCollisionProfileName(TEXT("BlockAll"));
	Ground = CreateDefaultSubobject<UProceduralMeshComponent>(TEXT("GroundMesh"));
	Ground->SetupAttachment(Mesh);
	Ground->bUseComplexAsSimpleCollision = true;
	Ground->SetCollisionProfileName(TEXT("BlockAll"));
	Ground->SetCastShadow(false);
	auto MakeHism = [this](const TCHAR* Name, bool bCollide)
	{
		UHierarchicalInstancedStaticMeshComponent* C = CreateDefaultSubobject<UHierarchicalInstancedStaticMeshComponent>(Name);
		C->SetupAttachment(Mesh);
		C->SetCollisionProfileName(bCollide ? TEXT("BlockAll") : TEXT("NoCollision"));
		return C;
	};
	Hydrants = MakeHism(TEXT("Hydrants"), true);
	Bins = MakeHism(TEXT("Bins"), true);
}

void ASCCityGenerator::OnConstruction(const FTransform& Transform)
{
	Super::OnConstruction(Transform);
	Generate();
}

FTransform ASCCityGenerator::GetSpawnTransform() const
{
	const FVector P = SC::DestPos(SC::Dests[0]) - FVector(3000.f, 0.f, -60.f);
	return FTransform(FRotator(0.f, 0.f, 0.f), GetActorTransform().TransformPosition(P));
}

void ASCCityGenerator::Generate()
{
	using namespace SC;
	FRandomStream Rng(Seed);
	enum ESec { SRoad, SWhite, SYellow, SWalk, SKerb, SRoof, SGrass, SFacade0 };
	const int32 NumFacades = FMath::Max(1, FMath::Min(Facades.Num() > 0 ? Facades.Num() : 6, 12)), NumShops = 6;
	const int32 SShop0 = SFacade0 + NumFacades;
	TArray<FBuf> B; B.SetNum(SShop0 + NumShops);
	TArray<FTransform> LampT, TreeT, HydrantT, BinT;

	// ground
	B[SGrass].Flat(-200000.f, -200000.f, 200000.f, 200000.f, -3.f, 400.f);

	// roads
	const float Lo = Road(0) - HW, Hi = Road(Grid) + HW;
	for (int32 K = 0; K <= Grid; ++K)
	{
		const float C = Road(K);
		B[SRoad].Flat(Lo, C - HW, Hi, C + HW, 0.f, 800.f);
		B[SRoad].Flat(C - HW, Lo, C + HW, Hi, 0.1f, 800.f);
	}

	// markings: centre double yellow, edge lines, dashed lane lines, zebra crossings at both ends of every segment
	auto Strip = [&](int32 Sec, bool bAlongX, float C, float Off, float A0, float A1, float W)
	{
		if (bAlongX) B[Sec].Flat(A0, C + Off - W / 2, A1, C + Off + W / 2, 2.f, 100.f);
		else B[Sec].Flat(C + Off - W / 2, A0, C + Off + W / 2, A1, 2.f, 100.f);
	};
	for (int32 K = 0; K <= Grid; ++K)
	{
		const float C = Road(K);
		for (int32 S = 0; S < Grid; ++S)
		{
			const float A0 = Road(S) + HW + 400.f, A1 = Road(S + 1) - HW - 400.f;
			for (bool bX : { true, false })
			{
				Strip(SYellow, bX, C, -18.f, A0, A1, 12.f);
				Strip(SYellow, bX, C, 18.f, A0, A1, 12.f);
				Strip(SWhite, bX, C, -HW + 35.f, A0, A1, 15.f);
				Strip(SWhite, bX, C, HW - 35.f, A0, A1, 15.f);
				for (float D = A0 + 200.f; D < A1 - 300.f; D += 900.f)
				{
					Strip(SWhite, bX, C, -LaneW, D, D + 300.f, 13.f);
					Strip(SWhite, bX, C, LaneW, D, D + 300.f, 13.f);
				}
				for (float Z0 : { Road(S) + HW + 50.f, Road(S + 1) - HW - 330.f })
					for (float X = -HW + 60.f; X < HW - 40.f; X += 120.f)
					{
						if (bX) B[SWhite].Flat(Z0, C + X, Z0 + 280.f, C + X + 60.f, 2.f, 100.f);
						else B[SWhite].Flat(C + X, Z0, C + X + 60.f, Z0 + 280.f, 2.f, 100.f);
					}
			}
		}
	}

	// which blocks hold a landmark
	TMap<FIntPoint, int32> Landmarks;
	for (int32 i = 0; i < UE_ARRAY_COUNT(Dests); ++i)
	{
		const FDest& D = Dests[i];
		const FIntPoint Blk = D.bAxisX ? FIntPoint(D.I, D.Side > 0 ? D.J : D.J - 1) : FIntPoint(D.Side > 0 ? D.J : D.J - 1, D.I);
		Landmarks.Add(Blk, i);
	}

	// subtle colour variations so neighbouring buildings of the same style don't look identical
	// colour washes over the scanned walls: white, cream, terracotta, sage, slate, sand, taupe, pale grey
	static const FColor Tints[] = { FColor(255, 255, 255), FColor(255, 238, 212), FColor(236, 196, 168), FColor(212, 226, 204),
		FColor(204, 214, 232), FColor(242, 226, 196), FColor(222, 206, 190), FColor(232, 234, 236) };
	auto Tinted = [&](int32 Sec, FColor C) -> FBuf& { B[Sec].Tint = C; return B[Sec]; };
	auto AddBuilding = [&](float X0, float Y0, float X1, float Y1, float H, int32 Style)
	{
		const float ShopH = 450.f;
		const FColor Tint = Tints[Rng.RandRange(0, UE_ARRAY_COUNT(Tints) - 1)];
		Tinted(SShop0 + Rng.RandRange(0, NumShops - 1), FColor::White).Box(X0, Y0, X1, Y1, KerbH, KerbH + ShopH, Rng.RandRange(0, 2), 800.f, ShopH);
		const float W = FMath::Min(X1 - X0, Y1 - Y0);
		if (H > 4000.f && W > 1400.f)
		{
			// podium + set-back tower (and sometimes a second set-back near the top)
			const float Podium = 1200.f + Rng.FRand() * 1000.f, Inset = 300.f + Rng.FRand() * 300.f;
			const int32 PodiumStyle = (Style + 1 + Rng.RandRange(0, NumFacades - 2)) % NumFacades;
			Tinted(SFacade0 + PodiumStyle, Tint).Box(X0, Y0, X1, Y1, KerbH + ShopH, KerbH + Podium, Rng.RandRange(0, 3), 400.f, 350.f);
			Tinted(SRoof, FColor::White).Flat(X0, Y0, X1, Y1, KerbH + Podium, 600.f);
			float TX0 = X0 + Inset, TY0 = Y0 + Inset, TX1 = X1 - Inset, TY1 = Y1 - Inset, Base = KerbH + Podium;
			const bool bTwoStep = Rng.FRand() < 0.4f && W > 2200.f;
			const float Top = KerbH + H, Step = bTwoStep ? Base + (Top - Base) * 0.7f : Top;
			Tinted(SFacade0 + Style, Tint).Box(TX0, TY0, TX1, TY1, Base, Step, Rng.RandRange(0, 3), 400.f, 350.f);
			if (bTwoStep)
			{
				Tinted(SRoof, FColor::White).Flat(TX0, TY0, TX1, TY1, Step, 600.f);
				TX0 += 300.f; TY0 += 300.f; TX1 -= 300.f; TY1 -= 300.f;
				Tinted(SFacade0 + Style, Tint).Box(TX0, TY0, TX1, TY1, Step, Top, Rng.RandRange(0, 3), 400.f, 350.f);
			}
			X0 = TX0; Y0 = TY0; X1 = TX1; Y1 = TY1;
		}
		else
		{
			Tinted(SFacade0 + Style, Tint).Box(X0, Y0, X1, Y1, KerbH + ShopH, KerbH + H, Rng.RandRange(0, 3), 400.f, 350.f);
		}
		Tinted(SRoof, FColor::White).Flat(X0, Y0, X1, Y1, KerbH + H, 600.f);
		// rooftop plant rooms / lift housings
		const int32 Units = H > 1200.f ? Rng.RandRange(0, 3) : 0;
		for (int32 U = 0; U < Units; ++U)
		{
			const float RW = 250.f + Rng.FRand() * 400.f, RD = 250.f + Rng.FRand() * 400.f, RH = 180.f + Rng.FRand() * 250.f;
			if (X1 - X0 < RW + 200.f || Y1 - Y0 < RD + 200.f) break;
			const float RX = Rng.FRandRange(X0 + 100.f, X1 - RW - 100.f), RY = Rng.FRandRange(Y0 + 100.f, Y1 - RD - 100.f);
			Tinted(SRoof, FColor(200, 200, 205)).Box(RX, RY, RX + RW, RY + RD, KerbH + H, KerbH + H + RH, 0.f, 400.f, 350.f);
			Tinted(SRoof, FColor(200, 200, 205)).Flat(RX, RY, RX + RW, RY + RD, KerbH + H + RH, 600.f);
		}
	};
	// facade style pools (indices into Facades): glass for towers, mixed mid-rise, masonry for low-rise
	auto PickStyle = [&](float H) -> int32
	{
		static const int32 Glass[] = { 2, 4, 9, 6 }, Mid[] = { 0, 3, 6, 10, 11, 7 }, Low[] = { 1, 5, 7, 8, 11, 0, 3 };
		auto Pick = [&](const int32* Arr, int32 N) { const int32 S = Arr[Rng.RandRange(0, N - 1)]; return S < NumFacades ? S : S % NumFacades; };
		if (H > 5000.f) return Pick(Glass, UE_ARRAY_COUNT(Glass));
		if (H > 2000.f) return Pick(Mid, UE_ARRAY_COUNT(Mid));
		return Pick(Low, UE_ARRAY_COUNT(Low));
	};

	for (int32 Bi = 0; Bi < Grid; ++Bi)
	{
		for (int32 Bj = 0; Bj < Grid; ++Bj)
		{
			const float X0 = Road(Bi) + HW, X1 = Road(Bi + 1) - HW, Y0 = Road(Bj) + HW, Y1 = Road(Bj + 1) - HW;
			B[SWalk].Flat(X0, Y0, X1, Y1, KerbH, 300.f);
			const FVector2D KUv[4] = { { 0, 0 }, { 1, 0 }, { 1, 1 }, { 0, 1 } };
			B[SKerb].Quad(FVector(X0, Y1, 0), FVector(X1, Y1, 0), FVector(X1, Y1, KerbH), FVector(X0, Y1, KerbH), KUv, FVector(0, 1, 0));
			B[SKerb].Quad(FVector(X1, Y0, 0), FVector(X0, Y0, 0), FVector(X0, Y0, KerbH), FVector(X1, Y0, KerbH), KUv, FVector(0, -1, 0));
			B[SKerb].Quad(FVector(X1, Y1, 0), FVector(X1, Y0, 0), FVector(X1, Y0, KerbH), FVector(X1, Y1, KerbH), KUv, FVector(1, 0, 0));
			B[SKerb].Quad(FVector(X0, Y0, 0), FVector(X0, Y1, 0), FVector(X0, Y1, KerbH), FVector(X0, Y0, KerbH), KUv, FVector(-1, 0, 0));

			// lamps and street trees alternate along each kerb; hydrant and bin near corners
			for (float T = 800.f; T < X1 - X0 - 600.f; T += 1600.f)
			{
				const bool bLamp = FMath::RoundToInt(T / 1600.f) % 2 == 0;
				const FVector Spots[4] = { { X0 + T, Y0 + 120.f, KerbH }, { X0 + T, Y1 - 120.f, KerbH }, { X0 + 120.f, Y0 + T, KerbH }, { X1 - 120.f, Y0 + T, KerbH } };
				for (const FVector& P : Spots)
				{
					if (bLamp) LampT.Add(FTransform(FRotator(0, Rng.FRandRange(0, 360), 0), P, FVector(LampScale)));
					else TreeT.Add(FTransform(FRotator(0, Rng.FRandRange(0, 360), 0), P, FVector(TreeScale * Rng.FRandRange(0.8f, 1.2f))));
				}
			}
			HydrantT.Add(FTransform(FRotator(0, Rng.FRandRange(0, 360), 0), FVector(X0 + 220.f, Y0 + 100.f, KerbH)));
			BinT.Add(FTransform(FRotator::ZeroRotator, FVector(X1 - 340.f, Y1 - 100.f, KerbH)));

			const int32* Lm = Landmarks.Find(FIntPoint(Bi, Bj));
			const float BX0 = X0 + Walk, BX1 = X1 - Walk, BY0 = Y0 + Walk, BY1 = Y1 - Walk;
			const bool bPark = (Lm && FString(Dests[*Lm].Landmark) == TEXT("park")) || (!Lm && Rng.FRand() < 0.05f);
			if (bPark)
			{
				B[SGrass].Flat(BX0, BY0, BX1, BY1, KerbH + 1.f, 400.f);
				for (int32 N = 0; N < 14; ++N)
					TreeT.Add(FTransform(FRotator(0, Rng.FRandRange(0, 360), 0), FVector(Rng.FRandRange(BX0 + 300, BX1 - 300), Rng.FRandRange(BY0 + 300, BY1 - 300), KerbH), FVector(TreeScale * Rng.FRandRange(0.8f, 1.3f))));
				continue;
			}
			if (Lm)
			{
				float LmH = 2000.f; int32 LmStyle = 0;
				LandmarkSpec(Dests[*Lm].Landmark, LmH, LmStyle);
				AddBuilding(BX0, BY0, BX1, BY1, LmH, LmStyle % NumFacades);
				continue;
			}
			const float CX = (X0 + X1) / 2, CY = (Y0 + Y1) / 2;
			const float Downtown = FMath::Max(0.f, 1.f - FVector2D(CX, CY).Size() / 34000.f);
			const float Split = Rng.FRand();
			TArray<FBox2D> Parcels;
			if (Split < 0.3f) Parcels.Add(FBox2D({ BX0, BY0 }, { BX1, BY1 }));
			else if (Split < 0.6f) { Parcels.Add(FBox2D({ BX0, BY0 }, { CX - 50, BY1 })); Parcels.Add(FBox2D({ CX + 50, BY0 }, { BX1, BY1 })); }
			else
			{
				Parcels.Add(FBox2D({ BX0, BY0 }, { CX - 50, CY - 50 })); Parcels.Add(FBox2D({ CX + 50, BY0 }, { BX1, CY - 50 }));
				Parcels.Add(FBox2D({ BX0, CY + 50 }, { CX - 50, BY1 })); Parcels.Add(FBox2D({ CX + 50, CY + 50 }, { BX1, BY1 }));
			}
			for (const FBox2D& P : Parcels)
			{
				const float H = 900.f + Rng.FRand() * 1400.f + FMath::Pow(Downtown, 1.6f) * Rng.FRand() * 11000.f;
				AddBuilding(P.Min.X, P.Min.Y, P.Max.X, P.Max.Y, H, PickStyle(H));
			}
		}
	}

	// upload sections
	Mesh->ClearAllMeshSections();
	Ground->ClearAllMeshSections();
	auto MatFor = [&](int32 S) -> UMaterialInterface*
	{
		switch (S)
		{
		case SRoad: return Asphalt; case SWhite: return PaintWhite; case SYellow: return PaintYellow; case SWalk: return Sidewalk;
		case SKerb: return Kerb; case SRoof: return Roof; case SGrass: return Grass;
		default:
			if (S >= SShop0) return Shopfronts.IsValidIndex(S - SShop0) ? Shopfronts[S - SShop0].Get() : nullptr;
			return Facades.IsValidIndex(S - SFacade0) ? Facades[S - SFacade0].Get() : nullptr;
		}
	};
	for (int32 S = 0; S < B.Num(); ++S)
	{
		if (!B[S].V.Num()) continue;
		const bool bCollide = S != SWhite && S != SYellow;
		// flat surfaces never need to cast shadows; keeping them out of the shadow pass saves a lot of GPU time
		const bool bFlat = S == SRoad || S == SWhite || S == SYellow || S == SWalk || S == SGrass;
		UProceduralMeshComponent* Target = bFlat ? Ground.Get() : Mesh.Get();
		Target->CreateMeshSection(S, B[S].V, B[S].T, B[S].N, B[S].UV, B[S].Col, B[S].Tan, bCollide);
		if (UMaterialInterface* M = MatFor(S)) Target->SetMaterial(S, M);
	}

	auto Fill = [](UHierarchicalInstancedStaticMeshComponent* C, UStaticMesh* M, const TArray<FTransform>& Ts)
	{
		C->ClearInstances();
		C->SetStaticMesh(M);
		if (M) C->AddInstances(Ts, false);
	};
	AddPropInstances(LampMeshes, LampT, true);
	AddPropInstances(TreeMeshes, TreeT, false);
	Fill(Hydrants, HydrantMesh, HydrantT);
	Fill(Bins, BinMesh, BinT);
}

void ASCCityGenerator::AddPropInstances(const TArray<TObjectPtr<UStaticMesh>>& Meshes, const TArray<FTransform>& Ts, bool bCollide)
{
	for (UStaticMesh* M : Meshes)
	{
		if (!M) continue;
		// created as construction-script components so the engine clears them on every rebuild
		UHierarchicalInstancedStaticMeshComponent* C = NewObject<UHierarchicalInstancedStaticMeshComponent>(this);
		C->CreationMethod = EComponentCreationMethod::UserConstructionScript;
		C->SetupAttachment(Mesh);
		C->SetStaticMesh(M);
		C->SetCollisionProfileName(bCollide ? TEXT("BlockAll") : TEXT("NoCollision"));
		C->RegisterComponent();
		C->AddInstances(Ts, false);
	}
}

void ASCCityGenerator::BeginPlay()
{
	Super::BeginPlay();
	if (!bSpawnDestinations) return;
	TSet<FString> Existing;
	for (TActorIterator<ASCDestination> It(GetWorld()); It; ++It) Existing.Add(It->DisplayName);
	for (const SC::FDest& D : SC::Dests)
	{
		if (Existing.Contains(D.Name)) continue;
		FActorSpawnParameters P;
		P.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
		P.bDeferConstruction = true;
		const FTransform T(GetActorTransform().TransformPosition(SC::DestPos(D) + FVector(0, 0, 2.f)));
		if (ASCDestination* Dest = GetWorld()->SpawnActor<ASCDestination>(ASCDestination::StaticClass(), T, P))
		{
			Dest->DisplayName = D.Name;
			Dest->FinishSpawning(T);
		}
	}
	UE_LOG(LogShiftCity, Log, TEXT("Shift City generated; destinations ready"));
}
