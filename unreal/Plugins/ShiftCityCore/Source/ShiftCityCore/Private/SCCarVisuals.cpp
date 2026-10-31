#include "SCCarVisuals.h"
#include "SCCarData.h"
#include "ShiftCityCore.h"
#include "ChaosVehicleWheel.h"
#include "ChaosWheeledVehicleMovementComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Dom/JsonObject.h"
#include "GameFramework/Pawn.h"
#include "GameFramework/SpringArmComponent.h"
#include "Interfaces/IPluginManager.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Materials/MaterialInterface.h"
#include "Misc/Compression.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "ProceduralMeshComponent.h"
#include "AssetRegistry/AssetRegistryModule.h"
#include "AssetRegistry/IAssetRegistry.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Engine/World.h"
#include "Materials/MaterialInstance.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

// ------------------------------------------------------------------ model data

namespace
{
	struct FCarEntry
	{
		FString HighFile, LowFile;
		float WheelBase = 260.f, Track = 150.f, WheelRadius = 33.f, Length = 450.f;
		TUniquePtr<FSCCarModel> High, Low;
		bool bTriedHigh = false, bTriedLow = false;
	};

	TMap<FString, FCarEntry>& Entries()
	{
		static TMap<FString, FCarEntry> Map;
		static bool bLoaded = false;
		if (!bLoaded)
		{
			bLoaded = true;
			TSharedPtr<IPlugin> Plugin = IPluginManager::Get().FindPlugin(TEXT("ShiftCityCore"));
			FString Text;
			if (!Plugin.IsValid() || !FFileHelper::LoadFileToString(Text, *FPaths::Combine(Plugin->GetBaseDir(), TEXT("Data/Cars/cars.json"))))
			{
				UE_LOG(LogShiftCity, Warning, TEXT("[ShiftCity] cars: Data/Cars/cars.json missing, using the template car"));
				return Map;
			}
			TSharedPtr<FJsonObject> JsonRoot;
			if (!FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Text), JsonRoot) || !JsonRoot.IsValid() || !JsonRoot->HasTypedField<EJson::Object>(TEXT("cars"))) return Map;
			// every body type in web/src/data/vehicles.ts (looked up by name: the JSON key type changed in UE 5.8)
			const TSharedPtr<FJsonObject> CarsObj = JsonRoot->GetObjectField(TEXT("cars"));
			const TCHAR* const BodyNames[] = { TEXT("classic"), TEXT("hatch"), TEXT("sedan"), TEXT("suv"), TEXT("gt"), TEXT("super"), TEXT("hybrid"), TEXT("gtv12"), TEXT("royal"), TEXT("hyper") };
			for (const TCHAR* BodyName : BodyNames)
			{
				if (!CarsObj.IsValid() || !CarsObj->HasTypedField<EJson::Object>(BodyName)) continue;
				const TSharedPtr<FJsonObject> Obj = CarsObj->GetObjectField(BodyName);
				if (!Obj.IsValid()) continue;
				FCarEntry& E = Map.Add(FString(BodyName));
				E.HighFile = Obj->GetStringField(TEXT("hi"));
				E.LowFile = Obj->GetStringField(TEXT("lo"));
				E.WheelBase = Obj->GetNumberField(TEXT("wheelBase"));
				E.Track = Obj->GetNumberField(TEXT("track"));
				E.WheelRadius = Obj->GetNumberField(TEXT("wheelRadius"));
				E.Length = Obj->GetNumberField(TEXT("length"));
			}
			UE_LOG(LogShiftCity, Log, TEXT("[ShiftCity] cars: %d designs available"), Map.Num());
		}
		return Map;
	}

	TUniquePtr<FSCCarModel> LoadModel(const FString& File, const FCarEntry& E)
	{
		TSharedPtr<IPlugin> Plugin = IPluginManager::Get().FindPlugin(TEXT("ShiftCityCore"));
		TArray<uint8> Packed;
		if (!Plugin.IsValid() || !FFileHelper::LoadFileToArray(Packed, *FPaths::Combine(Plugin->GetBaseDir(), TEXT("Data/Cars"), File)) || Packed.Num() < 8)
		{
			UE_LOG(LogShiftCity, Warning, TEXT("[ShiftCity] cars: could not read %s"), *File);
			return nullptr;
		}
		uint32 RawSize = 0;
		FMemory::Memcpy(&RawSize, Packed.GetData(), 4);
		TArray<uint8> Raw;
		Raw.SetNumUninitialized(RawSize);
		if (!FCompression::UncompressMemory(NAME_Zlib, Raw.GetData(), RawSize, Packed.GetData() + 4, Packed.Num() - 4))
		{
			UE_LOG(LogShiftCity, Warning, TEXT("[ShiftCity] cars: could not unpack %s"), *File);
			return nullptr;
		}
		int64 At = 0;
		bool bOk = true;
		auto Read = [&](void* Dest, int64 Bytes)
		{
			if (!bOk || At + Bytes > Raw.Num()) { bOk = false; return; }
			FMemory::Memcpy(Dest, Raw.GetData() + At, Bytes);
			At += Bytes;
		};
		char Magic[4];
		uint32 Count = 0;
		Read(Magic, 4);
		Read(&Count, 4);
		if (!bOk || FMemory::Memcmp(Magic, "SCC2", 4) != 0) return nullptr;

		TUniquePtr<FSCCarModel> Model = MakeUnique<FSCCarModel>();
		Model->WheelBase = E.WheelBase; Model->Track = E.Track; Model->WheelRadius = E.WheelRadius; Model->Length = E.Length;
		for (uint32 SectionNo = 0; SectionNo < Count && bOk; ++SectionNo)
		{
			FSCCarSection& S = Model->Sections.AddDefaulted_GetRef();
			float F[10];
			uint32 NumVerts = 0, NumIndices = 0;
			Read(&S.Part, 4);
			Read(&S.Flags, 4);
			Read(F, sizeof(F));
			Read(&NumVerts, 4);
			Read(&NumIndices, 4);
			if (!bOk) break;
			S.Color = FLinearColor(F[0], F[1], F[2]);
			S.Metallic = F[3]; S.Roughness = F[4];
			S.Emissive = FLinearColor(F[5], F[6], F[7]);
			S.Opacity = F[8]; S.ClearCoat = F[9];
			TArray<int16> Pos; Pos.SetNumUninitialized(NumVerts * 3);
			TArray<int8> Nrm; Nrm.SetNumUninitialized(NumVerts * 3);
			TArray<uint32> Idx; Idx.SetNumUninitialized(NumIndices);
			Read(Pos.GetData(), int64(NumVerts) * 6);
			Read(Nrm.GetData(), int64(NumVerts) * 3);
			Read(Idx.GetData(), int64(NumIndices) * 4);
			if (!bOk) break;
			S.Positions.SetNumUninitialized(NumVerts);
			S.Normals.SetNumUninitialized(NumVerts);
			for (uint32 V = 0; V < NumVerts; ++V)
			{
				S.Positions[V] = FVector(Pos[V * 3], Pos[V * 3 + 1], Pos[V * 3 + 2]) * 0.1; // millimetres -> cm
				S.Normals[V] = FVector(Nrm[V * 3], Nrm[V * 3 + 1], Nrm[V * 3 + 2]).GetSafeNormal();
			}
			S.Indices.SetNumUninitialized(NumIndices);
			for (uint32 Ix = 0; Ix < NumIndices; ++Ix) S.Indices[Ix] = int32(FMath::Min<uint32>(Idx[Ix], NumVerts - 1));
		}
		if (!bOk)
		{
			UE_LOG(LogShiftCity, Warning, TEXT("[ShiftCity] cars: %s is damaged"), *File);
			return nullptr;
		}
		float Top = 0.f;
		for (const FSCCarSection& Sec : Model->Sections) if (Sec.Part == 0) for (const FVector& P : Sec.Positions) Top = FMath::Max(Top, float(P.Z));
		Model->Height = Top;
		return Model;
	}

	UMaterialInterface* CarMaterial(bool bGlass)
	{
		static TWeakObjectPtr<UMaterialInterface> Surface, Glass;
		TWeakObjectPtr<UMaterialInterface>& Slot = bGlass ? Glass : Surface;
		if (!Slot.IsValid())
		{
			Slot = LoadObject<UMaterialInterface>(nullptr, bGlass ? TEXT("/Game/ShiftCity/Materials/M_CarGlass.M_CarGlass") : TEXT("/Game/ShiftCity/Materials/M_CarSurface.M_CarSurface"));
			if (!Slot.IsValid()) UE_LOG(LogShiftCity, Warning, TEXT("[ShiftCity] cars: car materials missing, run the setup script again"));
		}
		return Slot.Get();
	}
}

const FSCCarModel* SCCars::Get(const FString& Body, bool bHighDetail)
{
	FCarEntry* E = Entries().Find(Body);
	if (!E) return nullptr;
	bool& bTried = bHighDetail ? E->bTriedHigh : E->bTriedLow;
	TUniquePtr<FSCCarModel>& Model = bHighDetail ? E->High : E->Low;
	if (!bTried)
	{
		bTried = true;
		Model = LoadModel(bHighDetail ? E->HighFile : E->LowFile, *E);
	}
	return Model.Get();
}

TArray<FString> SCCars::Bodies()
{
	TArray<FString> Keys;
	Entries().GetKeys(Keys);
	return Keys;
}

FLinearColor SCCars::ParseColor(const FString& Hex)
{
	return FLinearColor(FColor::FromHex(Hex));
}

UProceduralMeshComponent* SCCars::Build(const FSCCarModel& Model, uint32 Part, USceneComponent* Parent, const FLinearColor& PaintColor, bool bCastShadow)
{
	if (!Parent) return nullptr;
	UObject* Outer = Parent->GetOwner() ? static_cast<UObject*>(Parent->GetOwner()) : static_cast<UObject*>(Parent);
	UProceduralMeshComponent* Mesh = NewObject<UProceduralMeshComponent>(Outer);
	Mesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	Mesh->SetCastShadow(bCastShadow);
	Mesh->SetupAttachment(Parent);
	Mesh->RegisterComponent();
	int32 SectionIndex = 0;
	for (const FSCCarSection& S : Model.Sections)
	{
		if (S.Part != Part) continue;
		Mesh->CreateMeshSection_LinearColor(SectionIndex, S.Positions, S.Indices, S.Normals, TArray<FVector2D>(), TArray<FLinearColor>(), TArray<FProcMeshTangent>(), false);
		if (UMaterialInterface* Base = CarMaterial((S.Flags & Glass) != 0))
		{
			UMaterialInstanceDynamic* Mid = UMaterialInstanceDynamic::Create(Base, Mesh);
			Mid->SetVectorParameterValue(TEXT("Color"), (S.Flags & Paint) ? PaintColor : S.Color);
			Mid->SetScalarParameterValue(TEXT("Metallic"), S.Metallic);
			Mid->SetScalarParameterValue(TEXT("Roughness"), (S.Flags & Paint) ? FMath::Min(S.Roughness, 0.1f) : S.Roughness); // pristine, showroom-gloss paint under the clear coat
			Mid->SetScalarParameterValue(TEXT("ClearCoat"), (S.Flags & Paint) ? 1.f : S.ClearCoat);
			Mid->SetScalarParameterValue(TEXT("Opacity"), S.Opacity);
			Mid->SetVectorParameterValue(TEXT("Emissive"), S.Emissive);
			Mesh->SetMaterial(SectionIndex, Mid);
		}
		++SectionIndex;
	}
	return Mesh;
}

// ------------------------------------------------------------------ Fab pack cars (Unreal only)

namespace
{
	// garage car -> Fab pack vehicle (David, 2026-10-31). Cars not listed keep their Shift City design.
	struct FFabCar { const TCHAR* Id; const TCHAR* Class; const TCHAR* Paint; };
	const FFabCar FabCars[] = {
		{ TEXT("classic"),  TEXT("/Game/CitySampleVehicles/vehicle06_Car/BP_vehicle06_Car.BP_vehicle06_Car_C"), nullptr }, // compact
		{ TEXT("metro"),    TEXT("/Game/CitySampleVehicles/vehicle07_Car/BP_vehicle07_Car.BP_vehicle07_Car_C"), nullptr }, // coupe
		{ TEXT("comfort"),  TEXT("/Game/CitySampleVehicles/vehicle03_Car/BP_vehicle03_Car.BP_vehicle03_Car_C"), nullptr }, // big saloon
		{ TEXT("exec_suv"), TEXT("/Game/CitySampleVehicles/vehicle02_Car/BP_vehicle02_Car.BP_vehicle02_Car_C"), nullptr }, // SUV
		{ TEXT("lux_ev"),   TEXT("/Game/CitySampleVehicles/vehicle05_Car/BP_vehicle05_Car.BP_vehicle05_Car_C"), nullptr }, // modern saloon
		{ TEXT("vortex"),   TEXT("/Game/NO_FACE_Hypercar/Blueprints/CarBP.CarBP_C"), TEXT("#b4541f") },                  // copper, like David's photo
	};
}

// ------------------------------------------------------------------ player car

USCCarVisuals::USCCarVisuals()
{
	PrimaryComponentTick.bCanEverTick = true;
	PrimaryComponentTick.TickGroup = TG_PostPhysics;
}

void USCCarVisuals::Apply(APawn* Pawn, const FSCVehicleDef& Car, const FSCUpgrades& Upgrades)
{
	if (!Pawn || Car.Id.IsEmpty()) return;
	USCCarVisuals* Visuals = Pawn->FindComponentByClass<USCCarVisuals>();
	if (!Visuals)
	{
		Visuals = NewObject<USCCarVisuals>(Pawn, TEXT("SCCarVisuals"));
		Visuals->RegisterComponent();
	}
	const FString Key = FString::Printf(TEXT("%s/%d/%d/%d"), *Car.Id, Upgrades.Engine, Upgrades.Brakes, Upgrades.Handling);
	if (Visuals->AppliedKey == Key) return;
	const bool bNewCar = !Visuals->AppliedKey.StartsWith(Car.Id + TEXT("/"));
	Visuals->AppliedKey = Key;
	if (bNewCar) Visuals->Rebuild(Car);
	Visuals->SetHandling(Car, Upgrades);
}

void USCCarVisuals::Clear()
{
	for (UProceduralMeshComponent* Mesh : Meshes) if (Mesh) Mesh->DestroyComponent();
	for (USceneComponent* Comp : Spinners) if (Comp) Comp->DestroyComponent();
	for (USceneComponent* Comp : Pivots) if (Comp) Comp->DestroyComponent();
	if (CarRoot) CarRoot->DestroyComponent();
	for (UPrimitiveComponent* Part : HiddenParts) if (Part) Part->SetVisibility(true);
	for (UPrimitiveComponent* Part : FabParts) if (Part) Part->DestroyComponent();
	Meshes.Reset(); Spinners.Reset(); Pivots.Reset(); HiddenParts.Reset(); PivotRest.Reset(); PhysicsWheel.Reset(); FabParts.Reset();
	TailLights.Reset(); TailGlow.Reset();
	CarRoot = nullptr;
}

void USCCarVisuals::Rebuild(const FSCVehicleDef& Car)
{
	Clear();
	// the Vehicle template's own sports car stays in the game as the Furia V12 (David's pick, 2026-10-30)
	if (Car.Id == TEXT("apex_v12"))
	{
		SetCameraFor(nullptr);
		UE_LOG(LogShiftCity, Log, TEXT("[ShiftCity] cars: player is now %s (the template sports car)"), *Car.Name);
		return;
	}
	APawn* Pawn = Cast<APawn>(GetOwner());
	const FSCCarModel* Model = SCCars::Get(Car.Body, true);
	USkeletalMeshComponent* Sk = Pawn ? Pawn->FindComponentByClass<USkeletalMeshComponent>() : nullptr;
	UChaosWheeledVehicleMovementComponent* Mv = Pawn ? Pawn->FindComponentByClass<UChaosWheeledVehicleMovementComponent>() : nullptr;
	if (!Model || !Sk || !Mv || Mv->WheelSetups.Num() < 4)
	{
		UE_LOG(LogShiftCity, Warning, TEXT("[ShiftCity] cars: can't dress the player as %s (model %d, mesh %d, wheels %d)"), *Car.Id, Model != nullptr, Sk != nullptr, Mv ? Mv->WheelSetups.Num() : -1);
		return;
	}

	// where the physics wheels are, in the car's own space (X forward, Y right)
	const FTransform ActorTm = Pawn->GetActorTransform();
	TArray<FVector> WheelAt;
	FVector Centre = FVector::ZeroVector;
	float Radius = 0.f;
	for (int32 W = 0; W < Mv->WheelSetups.Num(); ++W)
	{
		WheelAt.Add(ActorTm.InverseTransformPosition(Sk->GetSocketLocation(Mv->WheelSetups[W].BoneName)));
		Centre += WheelAt.Last();
		Radius += (Mv->Wheels.IsValidIndex(W) && Mv->Wheels[W]) ? Mv->Wheels[W]->WheelRadius : 35.f;
	}
	Centre /= WheelAt.Num();
	Radius /= WheelAt.Num();

	// hide the template's body, glass and wheels (the skeletal mesh is only the rig)
	for (UActorComponent* Comp : Pawn->GetComponents())
		if (UStaticMeshComponent* Part = Cast<UStaticMeshComponent>(Comp))
			if (Part->IsVisible()) { Part->SetVisibility(false); HiddenParts.Add(Part); }

	// our body: centred between the physics wheels, standing on the same ground
	CarRoot = NewObject<USceneComponent>(Pawn);
	CarRoot->SetupAttachment(Sk);
	CarRoot->RegisterComponent();
	CarRoot->SetWorldTransform(FTransform(ActorTm.GetRotation(), ActorTm.TransformPosition(FVector(Centre.X, Centre.Y, Centre.Z - Radius))));
	// a realistic Fab pack car where one is set up for this garage car
	FSCCarModel FabDims;
	if (BuildFromFab(Car, FabDims, WheelAt, Centre))
	{
		SetCameraFor(&FabDims);
		UE_LOG(LogShiftCity, Log, TEXT("[ShiftCity] cars: player is now %s (Fab pack car, %.0f cm long), %d template parts hidden"), *Car.Name, FabDims.Length, HiddenParts.Num());
		return;
	}
	const FLinearColor PaintColor = SCCars::ParseColor(Car.Color);
	UProceduralMeshComponent* BodyMesh = SCCars::Build(*Model, 0, CarRoot, PaintColor, true);
	Meshes.Add(BodyMesh);
	// remember the tail-light materials (body sections are numbered in model order) so braking can light them up
	int32 BodySection = 0;
	for (const FSCCarSection& Sec : Model->Sections)
	{
		if (Sec.Part != 0) continue;
		if ((Sec.Flags & SCCars::TailLight) && BodyMesh)
			if (UMaterialInstanceDynamic* Mid = Cast<UMaterialInstanceDynamic>(BodyMesh->GetMaterial(BodySection)))
			{
				TailLights.Add(Mid);
				TailGlow.Add(Sec.Emissive);
			}
		++BodySection;
	}
	bBrakeLit = false;

	// wheels where the design has them, each driven by the physics wheel on the same corner
	for (int32 Corner = 0; Corner < 4; ++Corner)
	{
		const bool bFront = Corner < 2, bRight = (Corner % 2) == 1;
		int32 Best = 0;
		float BestScore = -1e9f;
		for (int32 W = 0; W < WheelAt.Num(); ++W)
		{
			const FVector Rel = WheelAt[W] - Centre;
			const float Score = (bFront ? Rel.X : -Rel.X) + (bRight ? Rel.Y : -Rel.Y);
			if (Score > BestScore) { BestScore = Score; Best = W; }
		}
		PhysicsWheel.Add(Best);
		USceneComponent* Pivot = NewObject<USceneComponent>(Pawn);
		Pivot->SetupAttachment(CarRoot);
		Pivot->RegisterComponent();
		PivotRest.Add(FVector(bFront ? Model->WheelBase * 0.5f : -Model->WheelBase * 0.5f, bRight ? Model->Track * 0.5f : -Model->Track * 0.5f, Model->WheelRadius));
		Pivot->SetRelativeLocation(PivotRest.Last());
		USceneComponent* Spinner = NewObject<USceneComponent>(Pawn);
		Spinner->SetupAttachment(Pivot);
		Spinner->RegisterComponent();
		UProceduralMeshComponent* WheelMesh = SCCars::Build(*Model, 1, Spinner, PaintColor, true);
		if (WheelMesh && bRight) WheelMesh->SetRelativeScale3D(FVector(1.f, -1.f, 1.f)); // the model is a left wheel
		Pivots.Add(Pivot);
		Spinners.Add(Spinner);
		Meshes.Add(WheelMesh);
	}
	SetCameraFor(Model);
	UE_LOG(LogShiftCity, Log, TEXT("[ShiftCity] cars: player is now %s (%s), physics wheel radius %.0f, %d template parts hidden"), *Car.Name, *Car.Body, Radius, HiddenParts.Num());
}

bool USCCarVisuals::BuildFromFab(const FSCVehicleDef& Car, FSCCarModel& OutDims, const TArray<FVector>& WheelAt, const FVector& Centre)
{
	const FFabCar* Entry = nullptr;
	for (const FFabCar& F : FabCars) if (Car.Id == F.Id) { Entry = &F; break; }
	APawn* Pawn = Cast<APawn>(GetOwner());
	UClass* VehicleClass = Entry ? LoadClass<AActor>(nullptr, Entry->Class) : nullptr;
	if (!VehicleClass || !Pawn || !CarRoot)
	{
		if (Entry) UE_LOG(LogShiftCity, Warning, TEXT("[ShiftCity] cars: Fab car for %s not found (%s): using the Shift City design"), *Car.Id, Entry->Class);
		return false;
	}
	// spawn the pack vehicle out of sight just long enough to copy its parts
	FActorSpawnParameters Params;
	Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	AActor* Temp = GetWorld()->SpawnActor<AActor>(VehicleClass, FTransform(FVector(0.f, 0.f, -200000.f)), Params);
	USkeletalMeshComponent* TempSk = Temp ? Temp->FindComponentByClass<USkeletalMeshComponent>() : nullptr;
	if (!TempSk)
	{
		if (Temp) Temp->Destroy();
		return false;
	}
	if (UPrimitiveComponent* TempRoot = Cast<UPrimitiveComponent>(Temp->GetRootComponent())) TempRoot->SetSimulatePhysics(false);
	const FTransform SkTm = TempSk->GetComponentTransform();

	// wheel centres in the pack's rig: City Sample wheel sockets, or the hypercar's FL/FR/RL/RR bones
	const TCHAR* const WheelNames[4][2] = { { TEXT("wheel_front_turn_l"), TEXT("FL") }, { TEXT("wheel_front_turn_r"), TEXT("FR") }, { TEXT("wheel_rear_l"), TEXT("RL") }, { TEXT("wheel_rear_r"), TEXT("RR") } };
	FVector WheelPos[4];
	for (int32 Corner = 0; Corner < 4; ++Corner)
	{
		const TCHAR* Found = nullptr;
		for (const TCHAR* WheelName : WheelNames[Corner]) if (TempSk->DoesSocketExist(WheelName)) { Found = WheelName; break; }
		if (!Found)
		{
			UE_LOG(LogShiftCity, Warning, TEXT("[ShiftCity] cars: %s has no wheel %d"), Entry->Class, Corner);
			Temp->Destroy();
			return false;
		}
		WheelPos[Corner] = TempSk->GetSocketTransform(Found, RTS_Component).GetLocation();
	}
	// ground = the lowest visible point (the tyres); turn the pack so its front points along +X
	FBox WorldBox(ForceInit);
	TArray<UPrimitiveComponent*> Prims;
	Temp->GetComponents<UPrimitiveComponent>(Prims);
	for (UPrimitiveComponent* Prim : Prims)
		if (Prim->IsVisible() && (Cast<UStaticMeshComponent>(Prim) || Cast<USkeletalMeshComponent>(Prim))) WorldBox += Prim->Bounds.GetBox();
	const FVector Mid = (WheelPos[0] + WheelPos[1] + WheelPos[2] + WheelPos[3]) * 0.25;
	FVector Forward = (WheelPos[0] + WheelPos[1] - WheelPos[2] - WheelPos[3]) * 0.5;
	Forward.Z = 0.0;
	const FQuat Turn(FRotator(0.f, -float(Forward.Rotation().Yaw), 0.f));
	const FVector Base(Mid.X, Mid.Y, WorldBox.Min.Z - SkTm.GetLocation().Z);
	auto ToCar = [&Base, &Turn](const FTransform& InRig)
	{
		FTransform Out = InRig;
		Out.AddToTranslation(-Base);
		return Out * FTransform(Turn);
	};
	const FVector Size = WorldBox.GetSize();
	OutDims.Length = float(FMath::Max(Size.X, Size.Y));
	OutDims.Height = float(Size.Z);

	// paint: our own clear-coat car paint on every painted panel. City Sample's paint takes its colour from its traffic
	// system (a packed per-car parameter), so its own colour setting is ignored; ours also keeps the cars pristine.
	const FLinearColor Paint = SCCars::ParseColor(Entry->Paint ? FString(Entry->Paint) : Car.Color);
	auto CopyMaterials = [&Paint](UMeshComponent* Src, UMeshComponent* Dst)
	{
		const TArray<FName> SlotNames = Src->GetMaterialSlotNames();
		for (int32 M = 0; M < Src->GetNumMaterials(); ++M)
		{
			UMaterialInterface* Mat = Src->GetMaterial(M);
			const FString SlotName = SlotNames.IsValidIndex(M) ? SlotNames[M].ToString() : FString();
			const FString MatName = GetNameSafe(Mat);
			const bool bPaint = SlotName.Contains(TEXT("carPaint")) || MatName.Contains(TEXT("cover")) || MatName.Contains(TEXT("cober"));
			if (bPaint && CarMaterial(false))
			{
				UMaterialInstanceDynamic* PaintMid = UMaterialInstanceDynamic::Create(CarMaterial(false), Dst);
				PaintMid->SetVectorParameterValue(TEXT("Color"), Paint);
				PaintMid->SetScalarParameterValue(TEXT("Metallic"), 0.7f);
				PaintMid->SetScalarParameterValue(TEXT("Roughness"), 0.12f);
				PaintMid->SetScalarParameterValue(TEXT("ClearCoat"), 1.f);
				Dst->SetMaterial(M, PaintMid);
			}
			else Dst->SetMaterial(M, Mat);
		}
	};

	// wheel corners (FL FR RL RR), each driven by the physics wheel on the same corner
	for (int32 Corner = 0; Corner < 4; ++Corner)
	{
		const bool bFront = Corner < 2, bRight = (Corner % 2) == 1;
		int32 Best = 0;
		float BestScore = -1e9f;
		for (int32 W = 0; W < WheelAt.Num(); ++W)
		{
			const FVector Rel = WheelAt[W] - Centre;
			const float Score = float((bFront ? Rel.X : -Rel.X) + (bRight ? Rel.Y : -Rel.Y));
			if (Score > BestScore) { BestScore = Score; Best = W; }
		}
		PhysicsWheel.Add(Best);
		USceneComponent* Pivot = NewObject<USceneComponent>(Pawn);
		Pivot->SetupAttachment(CarRoot);
		Pivot->RegisterComponent();
		PivotRest.Add(ToCar(FTransform(WheelPos[Corner])).GetLocation());
		Pivot->SetRelativeLocation(PivotRest.Last());
		USceneComponent* Spinner = NewObject<USceneComponent>(Pawn);
		Spinner->SetupAttachment(Pivot);
		Spinner->RegisterComponent();
		Pivots.Add(Pivot);
		Spinners.Add(Spinner);
	}

	// copy every visible part: body and glass on the car, wheels on the spinners, brake parts on the steering pivots
	int32 Copied = 0;
	TArray<UStaticMeshComponent*> Statics;
	Temp->GetComponents<UStaticMeshComponent>(Statics);
	for (UStaticMeshComponent* Src : Statics)
	{
		if (!Src->GetStaticMesh() || !Src->IsVisible()) continue;
		const FTransform InCar = ToCar(Src->GetComponentTransform().GetRelativeTransform(SkTm));
		const FString Socket = Src->GetAttachSocketName().ToString().ToLower();
		USceneComponent* Parent = CarRoot;
		FTransform Rel = InCar;
		if (Socket.Contains(TEXT("wheel")))
		{
			const int32 Corner = (Socket.Contains(TEXT("front")) ? 0 : 2) + (Socket.EndsWith(TEXT("_r")) ? 1 : 0);
			const bool bSpins = Socket.Contains(TEXT("turn")) || Socket.Contains(TEXT("rear")); // front brake parts steer but don't spin
			Parent = bSpins ? Spinners[Corner] : Pivots[Corner];
			Rel = InCar.GetRelativeTransform(FTransform(PivotRest[Corner]));
		}
		UStaticMeshComponent* Dst = NewObject<UStaticMeshComponent>(Pawn);
		Dst->SetStaticMesh(Src->GetStaticMesh());
		Dst->SetCollisionEnabled(ECollisionEnabled::NoCollision);
		Dst->SetupAttachment(Parent);
		Dst->SetRelativeTransform(Rel);
		Dst->RegisterComponent();
		CopyMaterials(Src, Dst);
		FabParts.Add(Dst);
		++Copied;
	}
	// one-piece cars (the hypercar): the whole body is the skeletal mesh (its wheels don't spin yet)
	if (Copied < 2 && TempSk->GetSkeletalMeshAsset())
	{
		USkeletalMeshComponent* Dst = NewObject<USkeletalMeshComponent>(Pawn);
		Dst->SetSkeletalMeshAsset(TempSk->GetSkeletalMeshAsset());
		Dst->SetCollisionEnabled(ECollisionEnabled::NoCollision);
		Dst->SetupAttachment(CarRoot);
		Dst->SetRelativeTransform(ToCar(FTransform::Identity));
		Dst->RegisterComponent();
		CopyMaterials(TempSk, Dst);
		FabParts.Add(Dst);
		++Copied;
	}
	Temp->Destroy();
	UE_LOG(LogShiftCity, Log, TEXT("[ShiftCity] cars: built %s from %s (%d parts, wheelbase %.0f)"), *Car.Id, Entry->Class, Copied, float(FVector::Dist2D(WheelPos[0], WheelPos[2])));
	return Copied > 0;
}

void USCCarVisuals::SetCameraFor(const FSCCarModel* Model)
{
	APawn* Pawn = Cast<APawn>(GetOwner());
	if (!Pawn) return;
	// the template has a chase arm and an in-car arm: only move the chase one(s) (anything not named Front/Interior)
	TArray<USpringArmComponent*> Arms;
	Pawn->GetComponents<USpringArmComponent>(Arms);
	for (USpringArmComponent* Arm : Arms)
	{
		const FString ArmName = Arm->GetName();
		if (ArmName.Contains(TEXT("Front")) || ArmName.Contains(TEXT("Interior")) || ArmName.Contains(TEXT("Cockpit"))) continue;
		const FName Key = Arm->GetFName();
		if (!BaseArms.Contains(Key)) BaseArms.Add(Key, FVector(Arm->TargetArmLength, Arm->SocketOffset.Z, 0.f));
		const FVector Base = BaseArms[Key];
		// the template's chase camera is set for its low sports car: pull back for longer cars and up for taller ones
		Arm->TargetArmLength = float(Model ? Base.X * FMath::Clamp(Model->Length / 440.f, 1.f, 1.3f) * 1.5f : Base.X); // the template arm is short (380): about 5.7 m for most cars
		Arm->SocketOffset.Z = Model ? Base.Y + FMath::Max(0.f, Model->Height - 125.f) * 1.5 : Base.Y;
		UE_LOG(LogShiftCity, Log, TEXT("[ShiftCity] cars: camera arm %s length %.0f -> %.0f"), *ArmName, float(Base.X), Arm->TargetArmLength);
	}
}

void USCCarVisuals::SetHandling(const FSCVehicleDef& Car, const FSCUpgrades& Upgrades)
{
	APawn* Pawn = Cast<APawn>(GetOwner());
	UChaosWheeledVehicleMovementComponent* Mv = Pawn ? Pawn->FindComponentByClass<UChaosWheeledVehicleMovementComponent>() : nullptr;
	if (!Mv) return;
	if (!bHaveBase)
	{
		bHaveBase = true;
		BaseTorque = Mv->EngineSetup.MaxTorque;
		BaseDrag = Mv->DragCoefficient;
		for (UChaosVehicleWheel* Wheel : Mv->Wheels)
		{
			BaseFriction.Add(Wheel ? Wheel->FrictionForceMultiplier : 1.f);
			BaseSteer.Add(Wheel ? Wheel->MaxSteerAngle : 0.f);
			BaseBrake.Add(Wheel ? Wheel->MaxBrakeTorque : 0.f);
		}
	}
	// the template car drives like the Shift Classic; every other car is scaled from the web stats
	const float AccelR = Car.Accel / 5.2f * (1.f + 0.07f * Upgrades.Engine);
	const float TopR = Car.TopSpeed / 40.f * (1.f + 0.03f * Upgrades.Engine);
	const float BrakeR = Car.Brake / 9.f * (1.f + 0.1f * Upgrades.Brakes);
	const float GripR = Car.Grip * (1.f + 0.06f * Upgrades.Handling);
	const float SteerR = FMath::Min(Car.Steer / 0.62f * (1.f + 0.06f * Upgrades.Handling), 1.25f);
	Mv->SetMaxEngineTorque(BaseTorque * AccelR);
	Mv->SetDragCoefficient(BaseDrag * FMath::Clamp(AccelR / (TopR * TopR), 0.2f, 2.f)); // top speed ~ sqrt(torque / drag)
	for (int32 W = 0; W < BaseFriction.Num(); ++W)
	{
		Mv->SetWheelFrictionMultiplier(W, BaseFriction[W] * GripR);
		if (BaseSteer[W] > 0.1f) Mv->SetWheelMaxSteerAngle(W, BaseSteer[W] * SteerR);
		if (BaseBrake[W] > 0.f) Mv->SetWheelMaxBrakeTorque(W, BaseBrake[W] * BrakeR);
	}
	UE_LOG(LogShiftCity, Log, TEXT("[ShiftCity] cars: handling x%.2f accel, x%.2f top, x%.2f brakes, x%.2f grip"), AccelR, TopR, BrakeR, GripR);
}

void USCCarVisuals::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);
	if (Pivots.Num() != 4) return;
	APawn* Pawn = Cast<APawn>(GetOwner());
	UChaosWheeledVehicleMovementComponent* Mv = Pawn ? Pawn->FindComponentByClass<UChaosWheeledVehicleMovementComponent>() : nullptr;
	if (!Mv) return;
	// brake lights: much brighter while the brake (or handbrake) is held
	const bool bBraking = Mv->GetBrakeInput() > 0.1f || Mv->GetHandbrakeInput();
	if (bBraking != bBrakeLit)
	{
		bBrakeLit = bBraking;
		for (int32 L = 0; L < TailLights.Num(); ++L)
			if (TailLights[L]) TailLights[L]->SetVectorParameterValue(TEXT("Emissive"), TailGlow[L] * (bBraking ? 8.f : 1.f));
	}
	for (int32 Corner = 0; Corner < 4; ++Corner)
	{
		UChaosVehicleWheel* Wheel = Mv->Wheels.IsValidIndex(PhysicsWheel[Corner]) ? Mv->Wheels[PhysicsWheel[Corner]].Get() : nullptr;
		if (!Wheel || !Pivots[Corner] || !Spinners[Corner]) continue;
		const float Lift = FMath::Clamp(Wheel->GetSuspensionOffset(), -8.f, 8.f);
		Pivots[Corner]->SetRelativeLocationAndRotation(PivotRest[Corner] + FVector(0.f, 0.f, Lift), FRotator(0.f, Wheel->GetSteerAngle(), 0.f));
		Spinners[Corner]->SetRelativeRotation(FRotator(Wheel->GetRotationAngle(), 0.f, 0.f));
	}
}

// ------------------------------------------------------------------ build robot: Fab vehicle line-up

FVector USCCarVisuals::RobotLineup(UWorld* World, int32 Row)
{
	static TWeakObjectPtr<AActor> Studio;
	static TArray<TWeakObjectPtr<AActor>> Lineup;
	const FVector Origin(0.f, 0.f, 100000.f); // 1 km up (Unreal units are cm): far above the tallest towers
	const float Spacing = 700.f, RowGap = 1100.f;
	if (!World) return Origin;
	if (!Studio.IsValid())
	{
		AActor* Floor = World->SpawnActor<AActor>(AActor::StaticClass(), FTransform(Origin));
		Studio = Floor;
		USceneComponent* FloorRoot = NewObject<USceneComponent>(Floor);
		Floor->SetRootComponent(FloorRoot);
		FloorRoot->RegisterComponent();
		if (UStaticMesh* Cube = LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Cube.Cube")))
		{
			UStaticMeshComponent* Slab = NewObject<UStaticMeshComponent>(Floor);
			Slab->SetStaticMesh(Cube);
			Slab->SetupAttachment(FloorRoot);
			Slab->SetRelativeLocation(FVector(3.f * Spacing, RowGap, -50.f));
			Slab->SetRelativeScale3D(FVector(60.f, 40.f, 1.f));
			Slab->RegisterComponent();
		}
		TArray<FAssetData> Assets;
		// every Fab pack (any Content folder that isn't ours); the buildings pack is skipped, it holds no vehicles
		TArray<FAssetData> All;
		FModuleManager::LoadModuleChecked<FAssetRegistryModule>(TEXT("AssetRegistry")).Get().GetAssetsByPath(FName(TEXT("/Game")), All, true);
		const TCHAR* const OwnFolders[] = { TEXT("/Game/ShiftCity/"), TEXT("/Game/Vehicles/"), TEXT("/Game/VehicleTemplate/"), TEXT("/Game/Variant_"), TEXT("/Game/Input/"), TEXT("/Game/__") };
		for (const FAssetData& Asset : All)
		{
			const FString Path = Asset.PackagePath.ToString() + TEXT("/");
			bool bOurs = Path.Contains(TEXT("Building"));
			for (const TCHAR* Own : OwnFolders) bOurs = bOurs || Path.StartsWith(Own);
			if (!bOurs) Assets.Add(Asset);
		}
		Assets.Sort([](const FAssetData& A, const FAssetData& B) { return A.AssetName.LexicalLess(B.AssetName); });
		int32 Slot = 0;
		for (const FAssetData& Asset : Assets)
		{
			const FString AssetName = Asset.AssetName.ToString();
			if (Asset.AssetClassPath.GetAssetName() != FName(TEXT("Blueprint"))) continue;
			// drivable vehicles (Chaos wheeled pawns) plus City Sample's trailer
			FString NativeParent;
			Asset.GetTagValue(FName(TEXT("NativeParentClass")), NativeParent);
			if (!NativeParent.Contains(TEXT("WheeledVehiclePawn")) && !AssetName.StartsWith(TEXT("BP_trailer"))) continue;
			UClass* VehicleClass = LoadClass<AActor>(nullptr, *(Asset.GetObjectPathString() + TEXT("_C")));
			const FVector At = Origin + FVector((Slot % 7) * Spacing, (Slot / 7) * RowGap, 120.f);
			++Slot;
			AActor* Vehicle = VehicleClass ? World->SpawnActor<AActor>(VehicleClass, FTransform(FRotator(0.f, 90.f, 0.f), At)) : nullptr;
			if (!Vehicle) { UE_LOG(LogShiftCity, Warning, TEXT("[ShiftCity] FABCAR %s: could not spawn"), *AssetName); continue; }
			// a parked display: no physics, so nothing drops or rolls away before the photo
			if (UPrimitiveComponent* Body = Cast<UPrimitiveComponent>(Vehicle->GetRootComponent()))
			{
				Body->SetSimulatePhysics(false);
				Body->SetWorldLocationAndRotation(At, FRotator(0.f, 90.f, 0.f));
			}
			Lineup.Add(Vehicle);
			// every visible part: the skeletal mesh is only the rig, the body/glass/wheels are separate meshes
			TArray<UMeshComponent*> Parts;
			Vehicle->GetComponents<UMeshComponent>(Parts);
			for (UMeshComponent* Part : Parts)
			{
				const UStaticMeshComponent* SmPart = Cast<UStaticMeshComponent>(Part);
				FString Mats;
				for (int32 M = 0; M < Part->GetNumMaterials(); ++M) Mats += GetNameSafe(Part->GetMaterial(M)) + TEXT(" ");
				UE_LOG(LogShiftCity, Log, TEXT("[ShiftCity] FABCAR %s part %s (%s) attached to %s/%s mesh %s mats %s"), *AssetName, *Part->GetName(), *Part->GetClass()->GetName(),
					*GetNameSafe(Part->GetAttachParent()), *Part->GetAttachSocketName().ToString(), SmPart ? *GetNameSafe(SmPart->GetStaticMesh()) : TEXT("-"), *Mats.Left(400));
			}
			USkeletalMeshComponent* Sk = Vehicle->FindComponentByClass<USkeletalMeshComponent>();
			USkeletalMesh* Mesh = Sk ? Sk->GetSkeletalMeshAsset() : nullptr;
			const FBoxSphereBounds B = Sk ? Sk->CalcBounds(FTransform::Identity) : FBoxSphereBounds(ForceInit);
			UE_LOG(LogShiftCity, Log, TEXT("[ShiftCity] FABCAR %s (%s) mesh %s size %.0fx%.0fx%.0f slot %d"), *AssetName, *Asset.PackagePath.ToString(), *GetNameSafe(Mesh), B.BoxExtent.X * 2.f, B.BoxExtent.Y * 2.f, B.BoxExtent.Z * 2.f, Slot - 1);
			if (!Sk) continue;
			TArray<FName> Bones;
			Sk->GetBoneNames(Bones);
			FString BoneList;
			for (const FName& Bone : Bones) BoneList += Bone.ToString() + TEXT(" ");
			UE_LOG(LogShiftCity, Log, TEXT("[ShiftCity] FABCAR %s bones: %s"), *AssetName, *BoneList.Left(1500));
			for (UMeshComponent* Part : Parts) for (int32 M = 0; M < Part->GetNumMaterials(); ++M)
			{
				UMaterialInterface* Mat = Part->GetMaterial(M);
				if (!Cast<UMaterialInstance>(Mat)) continue;
				FString Params;
				if (UMaterialInstance* MI = Cast<UMaterialInstance>(Mat))
				{
					TArray<FMaterialParameterInfo> Infos;
					TArray<FGuid> Ids;
					MI->GetAllVectorParameterInfo(Infos, Ids);
					for (const FMaterialParameterInfo& Info : Infos) Params += TEXT("v:") + Info.Name.ToString() + TEXT(" ");
					MI->GetAllScalarParameterInfo(Infos, Ids);
					for (const FMaterialParameterInfo& Info : Infos) Params += TEXT("s:") + Info.Name.ToString() + TEXT(" ");
				}
				const TArray<FName> SlotNames = Part->GetMaterialSlotNames();
				const FString SlotName = SlotNames.IsValidIndex(M) ? SlotNames[M].ToString() : FString(TEXT("?"));
				UE_LOG(LogShiftCity, Log, TEXT("[ShiftCity] FABCAR %s mat %d %s (%s): %s"), *AssetName, M, *SlotName, *GetNameSafe(Mat), *Params.Left(800));
			}
		}
		UE_LOG(LogShiftCity, Log, TEXT("[ShiftCity] FABCAR line-up: %d vehicles"), Slot);
	}
	static int32 LoggedRow = -1;
	if (Row != LoggedRow && Lineup.Num() > 0 && Lineup[0].IsValid())
	{
		LoggedRow = Row;
		UE_LOG(LogShiftCity, Log, TEXT("[ShiftCity] FABCAR row %d: first vehicle now at %s (placed at %s)"), Row, *Lineup[0]->GetActorLocation().ToString(), *(Origin + FVector(0.f, 0.f, 120.f)).ToString());
	}
	return Origin + FVector(3.f * Spacing, Row * RowGap, 100.f);
}

