#include "SCCarVisuals.h"
#include "SCCarData.h"
#include "ShiftCityCore.h"
#include "ChaosVehicleWheel.h"
#include "ChaosWheeledVehicleMovementComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Dom/JsonObject.h"
#include "GameFramework/Pawn.h"
#include "Interfaces/IPluginManager.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Materials/MaterialInterface.h"
#include "Misc/Compression.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "ProceduralMeshComponent.h"
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
			Mid->SetScalarParameterValue(TEXT("Roughness"), S.Roughness);
			Mid->SetScalarParameterValue(TEXT("ClearCoat"), (S.Flags & Paint) ? 1.f : S.ClearCoat);
			Mid->SetScalarParameterValue(TEXT("Opacity"), S.Opacity);
			Mid->SetVectorParameterValue(TEXT("Emissive"), S.Emissive);
			Mesh->SetMaterial(SectionIndex, Mid);
		}
		++SectionIndex;
	}
	return Mesh;
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
	Meshes.Reset(); Spinners.Reset(); Pivots.Reset(); HiddenParts.Reset(); PivotRest.Reset(); PhysicsWheel.Reset();
	CarRoot = nullptr;
}

void USCCarVisuals::Rebuild(const FSCVehicleDef& Car)
{
	Clear();
	// the Vehicle template's own sports car stays in the game as the Furia V12 (David's pick, 2026-10-30)
	if (Car.Id == TEXT("apex_v12"))
	{
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
	const FLinearColor PaintColor = SCCars::ParseColor(Car.Color);
	Meshes.Add(SCCars::Build(*Model, 0, CarRoot, PaintColor, true));

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
	UE_LOG(LogShiftCity, Log, TEXT("[ShiftCity] cars: player is now %s (%s), physics wheel radius %.0f, %d template parts hidden"), *Car.Name, *Car.Body, Radius, HiddenParts.Num());
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
	for (int32 Corner = 0; Corner < 4; ++Corner)
	{
		UChaosVehicleWheel* Wheel = Mv->Wheels.IsValidIndex(PhysicsWheel[Corner]) ? Mv->Wheels[PhysicsWheel[Corner]].Get() : nullptr;
		if (!Wheel || !Pivots[Corner] || !Spinners[Corner]) continue;
		const float Lift = FMath::Clamp(Wheel->GetSuspensionOffset(), -8.f, 8.f);
		Pivots[Corner]->SetRelativeLocationAndRotation(PivotRest[Corner] + FVector(0.f, 0.f, Lift), FRotator(0.f, Wheel->GetSteerAngle(), 0.f));
		Spinners[Corner]->SetRelativeRotation(FRotator(Wheel->GetRotationAngle(), 0.f, 0.f));
	}
}
