// Turns the Vehicle template's car into the garage car the player picked: hides the template's body,
// builds the Shift City design (from Data/Cars) in its place, animates its wheels from the physics wheels
// and scales engine, brakes, grip and steering by the car's stats and upgrades.
#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "SCTypes.h"
#include "SCCarVisuals.generated.h"

struct FSCCarModel;
class APawn;
class UPrimitiveComponent;
class UProceduralMeshComponent;
class UMaterialInstanceDynamic;
class USceneComponent;
class UWorld;
class UCameraComponent;

UCLASS()
class SHIFTCITYCORE_API USCCarVisuals : public UActorComponent
{
	GENERATED_BODY()

public:
	USCCarVisuals();

	/** Dresses Pawn as Car (adds this component the first time). Cheap to call every second: it only
	 *  rebuilds when the car or its upgrades change. */
	static void Apply(APawn* Pawn, const FSCVehicleDef& Car, const FSCUpgrades& Upgrades);

	/** Build robot: parks every Fab pack vehicle on a floating floor (once) and logs its bones and paint parameters;
	 *  returns the centre of line-up row Row (0 or 1) for the camera. */
	static FVector RobotLineup(UWorld* World, int32 Row);

	/** Switches Pawn between the chase camera and a camera in the driver's seat. */
	static void ToggleView(APawn* Pawn);

	virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

private:
	void Rebuild(const FSCVehicleDef& Car);
	void SetHandling(const FSCVehicleDef& Car, const FSCUpgrades& Upgrades);
	void Clear();
	void SetCameraFor(const FSCCarModel* Model);
	void SetCockpit(bool bOn);
	/** Builds the car from a Fab pack vehicle (see FabCars in the .cpp); false if there is none for this car or the pack is missing. */
	bool BuildFromFab(const FSCVehicleDef& Car, FSCCarModel& OutDims, const TArray<FVector>& WheelAt, const FVector& Centre);

	FString AppliedKey;
	UPROPERTY() TObjectPtr<USceneComponent> CarRoot;
	UPROPERTY() TObjectPtr<UCameraComponent> CockpitCam;
	FVector CockpitEye = FVector(-20.f, -36.f, 112.f); // driver's eye in car space (left-hand drive)
	bool bCockpit = false;
	UPROPERTY() TArray<TObjectPtr<USceneComponent>> Pivots;   // FL FR RL RR
	UPROPERTY() TArray<TObjectPtr<USceneComponent>> Spinners;
	UPROPERTY() TArray<TObjectPtr<UProceduralMeshComponent>> Meshes;
	UPROPERTY() TArray<TObjectPtr<UPrimitiveComponent>> HiddenParts;
	UPROPERTY() TArray<TObjectPtr<UPrimitiveComponent>> FabParts; // parts copied from a Fab pack vehicle
	UPROPERTY() TArray<TObjectPtr<UMaterialInstanceDynamic>> TailLights; // glow brighter while braking
	TArray<FLinearColor> TailGlow;
	bool bBrakeLit = false;
	TArray<FVector> PivotRest;
	TArray<int32> PhysicsWheel; // physics wheel index driving each visual wheel

	TMap<FName, FVector> BaseArms; // per chase arm: X = arm length, Y = socket height
	bool bHaveBase = false;
	float BaseTorque = 0.f, BaseDrag = 0.f;
	TArray<float> BaseFriction, BaseSteer, BaseBrake;
};
