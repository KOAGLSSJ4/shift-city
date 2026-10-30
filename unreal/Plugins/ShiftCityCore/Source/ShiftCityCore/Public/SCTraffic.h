// AI traffic and traffic lights for the Shift City grid (port of the browser's world/Traffic.ts + signals).
// Cars follow lanes, choose turns at junctions, stop at red lights and brake for cars or the player ahead.
// They're kinematic (moved along the road), so they're cheap and never flip or crash into each other.
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Components/BoxComponent.h"
#include "SCTraffic.generated.h"

class USkeletalMesh;
class UStaticMesh;
class UStaticMeshComponent;
class UMaterialInterface;
class UMaterialInstanceDynamic;
class UBoxComponent;
class UHierarchicalInstancedStaticMeshComponent;

UENUM()
enum class ESCSignal : uint8 { Green, Yellow, Red };

USTRUCT()
struct FSCTrafficCar
{
	GENERATED_BODY()
	UPROPERTY() TObjectPtr<UBoxComponent> Body = nullptr;
	/** Wheels, spun to match the car's speed. */
	UPROPERTY() TArray<TObjectPtr<USceneComponent>> Wheels;
	int32 From = 0, To = 0, Lane = 0, Next = -1;
	float S = 0.f, Len = 0.f, Speed = 0.f, Cruise = 0.f;
	bool bTurning = false;
	FVector P0, P1, P2; float T = 0.f, TurnLen = 1.f;
	FVector Pos = FVector::ZeroVector; float Yaw = 0.f;
};

UCLASS()
class SHIFTCITYCORE_API ASCTraffic : public AActor
{
	GENERATED_BODY()
public:
	ASCTraffic();
	virtual void OnConstruction(const FTransform& Transform) override;
	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;

	UPROPERTY(EditAnywhere, Category = "Shift City|Traffic", meta = (ClampMin = "0", ClampMax = "120")) int32 CarCount = 40;
	/** Car bodies to pick from (the setup script uses the Vehicle template's cars). */
	UPROPERTY(EditAnywhere, Category = "Shift City|Traffic") TArray<TObjectPtr<USkeletalMesh>> CarMeshes;
	/** Parts bolted onto CarMeshes[i] (same index): the template's skeletal mesh is only the rig/suspension. */
	UPROPERTY(EditAnywhere, Category = "Shift City|Traffic") TArray<TObjectPtr<UStaticMesh>> CarBodies;
	UPROPERTY(EditAnywhere, Category = "Shift City|Traffic") TArray<TObjectPtr<UStaticMesh>> CarGlass;
	UPROPERTY(EditAnywhere, Category = "Shift City|Traffic") TArray<TObjectPtr<UStaticMesh>> CarWheels;
	/** Emissive material with "Color" (vector) and "Glow" (scalar) parameters, for signal lamps. */
	UPROPERTY(EditAnywhere, Category = "Shift City|Traffic") TObjectPtr<UMaterialInterface> LampMaterial;
	UPROPERTY(EditAnywhere, Category = "Shift City|Traffic") TObjectPtr<UMaterialInterface> PoleMaterial;
	UPROPERTY(EditAnywhere, Category = "Shift City|Traffic") int32 Seed = 7;

	/** Global signal plan shared by every junction. bAlongX = traffic moving along the X axis. */
	static ESCSignal SignalFor(bool bAlongX, float Time);

	/** World positions of all traffic cars (for the minimap). */
	void GetCarPositions(TArray<FVector>& Out) const { Out.Reset(); for (const FSCTrafficCar& C : Cars) if (C.Body) Out.Add(C.Body->GetComponentLocation()); }

private:
	void BuildSignals();
	void SpawnCars();
	void Place(FSCTrafficCar& C);
	FVector LanePoint(int32 From, int32 To, float S, int32 Lane) const;
	int32 ChooseNext(const FSCTrafficCar& C);

	UPROPERTY(VisibleAnywhere) TObjectPtr<USceneComponent> Root;
	UPROPERTY() TObjectPtr<UStaticMesh> CubeMesh;
	UPROPERTY() TObjectPtr<UStaticMesh> CylinderMesh;
	UPROPERTY() TObjectPtr<UStaticMesh> SphereMesh;
	UPROPERTY() TArray<FSCTrafficCar> Cars;
	UPROPERTY() TObjectPtr<UHierarchicalInstancedStaticMeshComponent> Poles;
	UPROPERTY() TObjectPtr<UHierarchicalInstancedStaticMeshComponent> Heads;
	UPROPERTY() TArray<TObjectPtr<UHierarchicalInstancedStaticMeshComponent>> Lamps; // [axis*3 + colour]
	UPROPERTY() TArray<TObjectPtr<UMaterialInstanceDynamic>> LampMats;
	FRandomStream Rng;
};
