#include "SCTraffic.h"
#include "SCCarData.h"
#include "SCCityLayout.h"
#include "ShiftCityCore.h"
#include "Components/BoxComponent.h"
#include "Components/HierarchicalInstancedStaticMeshComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Components/StaticMeshComponent.h"
#include "ProceduralMeshComponent.h"
#include "Engine/SkeletalMesh.h"
#include "Engine/StaticMesh.h"
#include "Engine/World.h"
#include "GameFramework/Pawn.h"
#include "GameFramework/PlayerController.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "UObject/ConstructorHelpers.h"

namespace
{
	constexpr int32 GridNodes = SC::Grid + 1;
	int32 NodeId(int32 I, int32 J) { return J * GridNodes + I; }
	FVector NodeLoc(int32 Id) { return SC::NodePos(Id % GridNodes, Id / GridNodes); }
	void Neighbours(int32 Id, TArray<int32>& Out)
	{
		Out.Reset();
		const int32 I = Id % GridNodes, J = Id / GridNodes;
		if (I > 0) Out.Add(NodeId(I - 1, J));
		if (I < SC::Grid) Out.Add(NodeId(I + 1, J));
		if (J > 0) Out.Add(NodeId(I, J - 1));
		if (J < SC::Grid) Out.Add(NodeId(I, J + 1));
	}
	constexpr float SignalCycle = 22.f;
	// everyday cars most of the time, the odd supercar; colours of real city traffic
	const TCHAR* const TrafficBodies[] = { TEXT("hatch"), TEXT("sedan"), TEXT("suv"), TEXT("classic"), TEXT("hatch"), TEXT("sedan"), TEXT("gt"),
		TEXT("suv"), TEXT("royal"), TEXT("classic"), TEXT("sedan"), TEXT("sedan"), TEXT("hatch"), TEXT("hybrid"), TEXT("gtv12"), TEXT("hyper") };
	const TCHAR* const TrafficColours[] = { TEXT("#e8e8e6"), TEXT("#141518"), TEXT("#9ca1a7"), TEXT("#5b6168"), TEXT("#1f3a64"), TEXT("#8c1c1c"),
		TEXT("#e8e8e6"), TEXT("#2b2d31"), TEXT("#c9c3b6"), TEXT("#2f5d46"), TEXT("#b8bcc2"), TEXT("#d9a21b"), TEXT("#3d6fb6") };
}

ASCTraffic::ASCTraffic()
{
	PrimaryActorTick.bCanEverTick = true;
	Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	RootComponent = Root;
	static ConstructorHelpers::FObjectFinder<UStaticMesh> CubeF(TEXT("/Engine/BasicShapes/Cube.Cube"));
	static ConstructorHelpers::FObjectFinder<UStaticMesh> CylF(TEXT("/Engine/BasicShapes/Cylinder.Cylinder"));
	static ConstructorHelpers::FObjectFinder<UStaticMesh> SphF(TEXT("/Engine/BasicShapes/Sphere.Sphere"));
	CubeMesh = CubeF.Object; CylinderMesh = CylF.Object; SphereMesh = SphF.Object;
}

ESCSignal ASCTraffic::SignalFor(bool bAlongX, float Time)
{
	const float C = FMath::Fmod(FMath::Fmod(Time, SignalCycle) + SignalCycle, SignalCycle);
	const float Local = bAlongX ? FMath::Fmod(C + 11.f, SignalCycle) : C;
	return Local < 8.f ? ESCSignal::Green : Local < 10.5f ? ESCSignal::Yellow : ESCSignal::Red;
}

void ASCTraffic::OnConstruction(const FTransform& Transform)
{
	Super::OnConstruction(Transform);
	BuildSignals();
}

void ASCTraffic::BuildSignals()
{
	auto MakeHism = [this](UStaticMesh* Mesh, UMaterialInterface* Mat) -> UHierarchicalInstancedStaticMeshComponent*
	{
		UHierarchicalInstancedStaticMeshComponent* C = NewObject<UHierarchicalInstancedStaticMeshComponent>(this);
		C->CreationMethod = EComponentCreationMethod::UserConstructionScript;
		C->SetupAttachment(Root);
		C->SetStaticMesh(Mesh);
		if (Mat) C->SetMaterial(0, Mat);
		C->SetCollisionEnabled(ECollisionEnabled::NoCollision);
		C->RegisterComponent();
		return C;
	};
	Poles = MakeHism(CylinderMesh, PoleMaterial);
	Heads = MakeHism(CubeMesh, PoleMaterial);
	Lamps.Reset();
	LampMats.Reset();
	for (int32 k = 0; k < 6; ++k)
	{
		UMaterialInstanceDynamic* Mid = LampMaterial ? UMaterialInstanceDynamic::Create(LampMaterial, this) : nullptr;
		const FLinearColor Col[3] = { FLinearColor(0.1f, 1.f, 0.35f), FLinearColor(1.f, 0.6f, 0.f), FLinearColor(1.f, 0.08f, 0.05f) };
		if (Mid) Mid->SetVectorParameterValue(TEXT("Color"), Col[k % 3]);
		UHierarchicalInstancedStaticMeshComponent* L = MakeHism(SphereMesh, Mid);
		L->SetCastShadow(false);
		Lamps.Add(L);
		LampMats.Add(Mid);
	}

	TArray<int32> Nb;
	const float HW = SC::HW;
	for (int32 J = 0; J <= SC::Grid; ++J) for (int32 I = 0; I <= SC::Grid; ++I)
	{
		const int32 Id = NodeId(I, J);
		Neighbours(Id, Nb);
		if (Nb.Num() < 3) continue;
		const FVector C = NodeLoc(Id);
		for (int32 Other : Nb)
		{
			// approach direction D: from the neighbour toward this junction
			const FVector D = (C - NodeLoc(Other)).GetSafeNormal();
			const FVector Right(-D.Y, D.X, 0.f);
			const bool bAlongX = FMath::Abs(D.X) > 0.5f;
			const FVector Base = C - D * (HW + 100.f) + Right * (HW + 100.f) + FVector(0, 0, SC::KerbH);
			const FRotator Face = (-D).Rotation(); // lamps face oncoming traffic
			// pole 4.6 m, arm over the road, head box with three lamps
			Poles->AddInstance(FTransform(FRotator::ZeroRotator, Base + FVector(0, 0, 230.f), FVector(0.18f, 0.18f, 4.6f)));
			const FVector ArmMid = Base - Right * 210.f + FVector(0, 0, 450.f);
			Poles->AddInstance(FTransform(FRotator(90.f, 0.f, 0.f) + FRotator(0.f, Right.Rotation().Yaw, 0.f), ArmMid, FVector(0.08f, 0.08f, 4.2f)));
			const FVector HeadPos = Base - Right * 360.f + FVector(0, 0, 400.f);
			Heads->AddInstance(FTransform(Face, HeadPos, FVector(0.3f, 0.4f, 1.1f)));
			for (int32 k = 0; k < 3; ++k) // red top, yellow middle, green bottom
			{
				const FVector LampPos = HeadPos - D * 16.f + FVector(0, 0, 35.f - k * 35.f);
				const int32 Colour = 2 - k; // index: 0 green, 1 yellow, 2 red
				Lamps[(bAlongX ? 3 : 0) + Colour]->AddInstance(FTransform(FRotator::ZeroRotator, LampPos, FVector(0.24f)));
			}
		}
	}
}

FVector ASCTraffic::LanePoint(int32 From, int32 To, float S, int32 Lane) const
{
	const FVector A = NodeLoc(From), B = NodeLoc(To);
	const FVector D = (B - A).GetSafeNormal();
	const FVector Right(-D.Y, D.X, 0.f); // drive on the right
	return A + D * S + Right * (SC::LaneW / 2.f + Lane * SC::LaneW);
}

void ASCTraffic::BeginPlay()
{
	Super::BeginPlay();
	Rng.Initialize(Seed);
	SpawnCars();
	UE_LOG(LogShiftCity, Log, TEXT("[ShiftCity] traffic: spawned %d cars using %d car model(s)"), Cars.Num(), CarMeshes.Num());
	// diagnostics for "traffic is invisible": where the first car is and how big its mesh says it is
	if (Cars.Num() > 0 && Cars[0].Body)
	{
		TArray<USceneComponent*> Kids;
		Cars[0].Body->GetChildrenComponents(true, Kids);
		for (USceneComponent* Kid : Kids)
			if (UPrimitiveComponent* Prim = Cast<UPrimitiveComponent>(Kid))
				UE_LOG(LogShiftCity, Log, TEXT("[ShiftCity] traffic car 0: %s (%s) at %s, bounds radius %.0f, visible %d, registered %d"),
					*GetNameSafe(Prim->GetClass()), *Prim->GetAttachSocketName().ToString(), *Prim->GetComponentLocation().ToString(), Prim->Bounds.SphereRadius, Prim->IsVisible() ? 1 : 0, Prim->IsRegistered() ? 1 : 0);
	}
}

void ASCTraffic::SpawnCars()
{
	TArray<int32> Nb;
	for (int32 k = 0; k < CarCount; ++k)
	{
		FSCTrafficCar C;
		C.From = Rng.RandRange(0, GridNodes * GridNodes - 1);
		Neighbours(C.From, Nb);
		C.To = Nb[Rng.RandRange(0, Nb.Num() - 1)];
		C.Lane = Rng.RandRange(0, 1);
		C.Len = SC::Pitch;
		C.S = SC::HW + 400.f + Rng.FRand() * 4000.f;
		C.Cruise = 900.f + Rng.FRand() * 500.f; // 9-14 m/s
		C.Speed = C.Cruise;

		UBoxComponent* Box = NewObject<UBoxComponent>(this);
		Box->SetBoxExtent(FVector(225.f, 95.f, 70.f));
		Box->SetCollisionProfileName(TEXT("BlockAllDynamic"));
		Box->SetMobility(EComponentMobility::Movable);
		Box->SetupAttachment(Root);
		Box->RegisterComponent();
		const FSCCarModel* Design = SCCars::Get(TrafficBodies[k % int32(UE_ARRAY_COUNT(TrafficBodies))], false);
		if (Design)
		{
			// a Shift City design (same models as the garage cars, lower detail)
			Box->SetBoxExtent(FVector(Design->Length * 0.5f, 92.f, 70.f));
			USceneComponent* CarRoot = NewObject<USceneComponent>(this);
			CarRoot->SetupAttachment(Box);
			CarRoot->SetRelativeLocation(FVector(0.f, 0.f, -70.f));
			CarRoot->RegisterComponent();
			const FLinearColor Colour = SCCars::ParseColor(TrafficColours[Rng.RandRange(0, int32(UE_ARRAY_COUNT(TrafficColours)) - 1)]);
			SCCars::Build(*Design, 0, CarRoot, Colour, true);
			for (int32 Corner = 0; Corner < 4; ++Corner)
			{
				const bool bFront = Corner < 2, bRight = (Corner % 2) == 1;
				USceneComponent* Spinner = NewObject<USceneComponent>(this);
				Spinner->SetupAttachment(CarRoot);
				Spinner->SetRelativeLocation(FVector(bFront ? Design->WheelBase * 0.5f : -Design->WheelBase * 0.5f, bRight ? Design->Track * 0.5f : -Design->Track * 0.5f, Design->WheelRadius));
				Spinner->RegisterComponent();
				if (UProceduralMeshComponent* WheelMesh = SCCars::Build(*Design, 1, Spinner, Colour, false))
					if (bRight) WheelMesh->SetRelativeScale3D(FVector(1.f, -1.f, 1.f));
				C.Wheels.Add(Spinner);
			}
		}
		else if (CarMeshes.Num() > 0 && CarMeshes[k % CarMeshes.Num()])
		{
			USkeletalMeshComponent* Sk = NewObject<USkeletalMeshComponent>(this);
			Sk->SetSkeletalMeshAsset(CarMeshes[k % CarMeshes.Num()]);
			Sk->SetCollisionEnabled(ECollisionEnabled::NoCollision);
			Sk->SetupAttachment(Box);
			Sk->SetRelativeLocation(FVector(0, 0, -70.f));
			Sk->RegisterComponent();
			// body, glass and a wheel on every wheel bone, the way the template's car blueprints assemble them
			const int32 Model = k % CarMeshes.Num();
			auto Part = [&](UStaticMesh* Mesh, FName Bone, bool bMirror) -> UStaticMeshComponent*
			{
				if (!Mesh) return nullptr;
				UStaticMeshComponent* M = NewObject<UStaticMeshComponent>(this);
				M->SetStaticMesh(Mesh);
				M->SetCollisionEnabled(ECollisionEnabled::NoCollision);
				M->SetupAttachment(Sk, Bone);
				if (bMirror) M->SetRelativeRotation(FRotator(0.f, 180.f, 0.f));
				M->RegisterComponent();
				return M;
			};
			Part(CarBodies.IsValidIndex(Model) ? CarBodies[Model].Get() : nullptr, NAME_None, false);
			Part(CarGlass.IsValidIndex(Model) ? CarGlass[Model].Get() : nullptr, NAME_None, false);
			if (UStaticMesh* Wheel = CarWheels.IsValidIndex(Model) ? CarWheels[Model].Get() : nullptr)
			{
				TArray<FName> Bones;
				Sk->GetBoneNames(Bones);
				// the template rigs have PhysWheel_* and VisWheel_* bones at the same spot: use the visual ones if present
				const bool bHasVis = Bones.ContainsByPredicate([](const FName& BoneName) { return BoneName.ToString().StartsWith(TEXT("VisWheel")); });
				for (const FName& Bone : Bones)
				{
					const FString B = Bone.ToString().ToLower();
					if (!B.Contains(TEXT("wheel")) && !B.Contains(TEXT("tire"))) continue;
					if (bHasVis && !B.StartsWith(TEXT("viswheel"))) continue;
					if (UStaticMeshComponent* WheelComp = Part(Wheel, Bone, B.Contains(TEXT("right")) || B.EndsWith(TEXT("_r")) || B.Contains(TEXT("_r_")))) C.Wheels.Add(WheelComp);
				}
			}
		}
		else
		{
			UStaticMeshComponent* M = NewObject<UStaticMeshComponent>(this);
			M->SetStaticMesh(CubeMesh);
			M->SetRelativeScale3D(FVector(4.5f, 1.9f, 1.4f));
			M->SetCollisionEnabled(ECollisionEnabled::NoCollision);
			M->SetupAttachment(Box);
			M->RegisterComponent();
		}
		C.Body = Box;
		Cars.Add(C);
		Place(Cars.Last());
	}
}

int32 ASCTraffic::ChooseNext(const FSCTrafficCar& C)
{
	TArray<int32> Nb, Allowed;
	Neighbours(C.To, Nb);
	Nb.Remove(C.From);
	if (Nb.Num() == 0) return C.From;
	const FVector D = (NodeLoc(C.To) - NodeLoc(C.From)).GetSafeNormal();
	int32 Straight = -1;
	for (int32 X : Nb)
	{
		const FVector E = (NodeLoc(X) - NodeLoc(C.To)).GetSafeNormal();
		const float Cross = D.X * E.Y - D.Y * E.X; // > 0: turning right in Unreal's left-handed axes
		if (FMath::Abs(Cross) < 0.5f) { Straight = X; Allowed.Add(X); }
		else if ((C.Lane == 0 && Cross < 0.f) || (C.Lane == 1 && Cross > 0.f)) Allowed.Add(X); // inner lane turns left, outer right
	}
	if (Straight >= 0 && Rng.FRand() < 0.55f) return Straight;
	const TArray<int32>& Pool = Allowed.Num() ? Allowed : Nb;
	return Pool[Rng.RandRange(0, Pool.Num() - 1)];
}

void ASCTraffic::Place(FSCTrafficCar& C)
{
	FVector Dir;
	if (C.bTurning)
	{
		const float T = C.T, U = 1.f - T;
		C.Pos = U * U * C.P0 + 2.f * U * T * C.P1 + T * T * C.P2;
		Dir = 2.f * U * (C.P1 - C.P0) + 2.f * T * (C.P2 - C.P1);
	}
	else
	{
		C.Pos = LanePoint(C.From, C.To, C.S, C.Lane);
		Dir = NodeLoc(C.To) - NodeLoc(C.From);
	}
	C.Yaw = FMath::RadiansToDegrees(FMath::Atan2(Dir.Y, Dir.X));
	if (C.Body) C.Body->SetWorldLocationAndRotation(GetActorTransform().TransformPosition(C.Pos + FVector(0, 0, 72.f)), FRotator(0.f, C.Yaw, 0.f));
}

void ASCTraffic::Tick(float Dt)
{
	Super::Tick(Dt);
	const float Time = GetWorld()->GetTimeSeconds();
	// signal lamps
	for (int32 Axis = 0; Axis < 2; ++Axis)
	{
		const ESCSignal St = SignalFor(Axis == 1, Time);
		for (int32 Col = 0; Col < 3; ++Col)
			if (LampMats.IsValidIndex(Axis * 3 + Col) && LampMats[Axis * 3 + Col])
				LampMats[Axis * 3 + Col]->SetScalarParameterValue(TEXT("Glow"), int32(St) == Col ? 30.f : 0.02f);
	}

	APlayerController* PC = GetWorld()->GetFirstPlayerController();
	const APawn* Player = PC ? PC->GetPawn() : nullptr;
	const FVector PlayerPos = Player ? GetActorTransform().InverseTransformPosition(Player->GetActorLocation()) : FVector(1e9);
	TArray<int32> Nb;
	for (FSCTrafficCar& C : Cars)
	{
		const FVector Fwd = FRotator(0.f, C.Yaw, 0.f).Vector();
		float Gap = 1e9f;
		auto Probe = [&](const FVector& P, float OtherLen)
		{
			const FVector R = P - C.Pos;
			const float Ahead = FVector::DotProduct(R, Fwd);
			const float Lat = FMath::Abs(R.X * Fwd.Y - R.Y * Fwd.X);
			if (Ahead > 0.f && Ahead < 3000.f && Lat < 220.f) Gap = FMath::Min(Gap, Ahead - (450.f + OtherLen) / 2.f);
		};
		for (const FSCTrafficCar& O : Cars) if (&O != &C) Probe(O.Pos, 450.f);
		Probe(PlayerPos, 480.f);
		if (!C.bTurning)
		{
			Neighbours(C.To, Nb);
			const bool bAlongX = FMath::Abs(NodeLoc(C.To).X - NodeLoc(C.From).X) > 1.f;
			const float StopAt = C.Len - SC::HW - 450.f;
			const ESCSignal St = SignalFor(bAlongX, Time);
			if (Nb.Num() >= 3 && St != ESCSignal::Green && C.S < StopAt + 50.f)
			{
				const float ToStop = StopAt - C.S;
				if (St == ESCSignal::Red || ToStop > C.Speed * 0.9f) Gap = FMath::Min(Gap, ToStop + 50.f);
			}
		}
		const float Target = Gap < 150.f ? 0.f : FMath::Min(C.Cruise, FMath::Max(0.f, (Gap - 150.f) * 0.9f));
		C.Speed = FMath::Max(0.f, C.Speed + FMath::Clamp(Target - C.Speed, -900.f * Dt, 300.f * Dt));

		if (C.bTurning)
		{
			C.T += C.Speed * Dt / C.TurnLen;
			if (C.T >= 1.f) { C.From = C.To; C.To = C.Next; C.S = SC::HW + 400.f; C.bTurning = false; }
		}
		else
		{
			C.S += C.Speed * Dt;
			if (C.S >= C.Len - SC::HW - 400.f)
			{
				C.Next = ChooseNext(C);
				C.P0 = LanePoint(C.From, C.To, C.Len - SC::HW - 400.f, C.Lane);
				C.P2 = LanePoint(C.To, C.Next, SC::HW + 400.f, C.Lane);
				const FVector In = (NodeLoc(C.To) - NodeLoc(C.From)).GetSafeNormal(), Out = (NodeLoc(C.Next) - NodeLoc(C.To)).GetSafeNormal();
				if (C.Next == C.From) C.P1 = NodeLoc(C.To);
				else if (FVector::DotProduct(In, Out) > 0.5f) C.P1 = (C.P0 + C.P2) / 2.f;
				else C.P1 = FMath::Abs(In.X) > 0.5f ? FVector(C.P2.X, C.P0.Y, 0.f) : FVector(C.P0.X, C.P2.Y, 0.f); // where the two lane lines cross
				C.TurnLen = FMath::Max(400.f, FVector::Dist(C.P0, C.P2) * 1.1f);
				C.T = 0.f;
				C.bTurning = true;
			}
		}
		Place(C);
		// roll the wheels: distance / radius (template wheels are ~35 cm)
		if (C.Wheels.Num() > 0)
		{
			const float Deg = FMath::RadiansToDegrees(C.Speed * Dt / 35.f);
			for (USceneComponent* WheelComp : C.Wheels) if (WheelComp) WheelComp->AddLocalRotation(FRotator(-Deg, 0.f, 0.f));
		}
	}
}
