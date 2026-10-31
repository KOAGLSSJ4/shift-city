// Car models exported from the browser version (web/scripts/export-cars.ts, Data/Cars/*.bin) and built
// here as procedural meshes: the player's garage car (USCCarVisuals) and the traffic use the same designs.
#pragma once

#include "CoreMinimal.h"

class UProceduralMeshComponent;
class USceneComponent;
class UPrimitiveComponent;
class UStaticMesh;
class USkeletalMesh;
class UMaterialInterface;
class UWorld;

struct FSCCarSection
{
	uint32 Part = 0;  // 0 body, 1 wheel
	uint32 Flags = 0; // SCCars::Paint | Glass | ...
	FLinearColor Color = FLinearColor::Gray;
	FLinearColor Emissive = FLinearColor::Black;
	float Metallic = 0.f, Roughness = 0.5f, Opacity = 1.f, ClearCoat = 0.f;
	TArray<FVector> Positions;
	TArray<FVector> Normals;
	TArray<int32> Indices;
};

struct FSCCarModel
{
	TArray<FSCCarSection> Sections;
	// centimetres; the body is centred between the axles with the ground at Z 0
	float WheelBase = 260.f, Track = 150.f, WheelRadius = 33.f, Length = 450.f, Height = 145.f;
};

/** A Fab pack vehicle read once into car space (X forward, Y right, ground at Z 0, centred between the axles). */
struct FSCFabPart
{
	UStaticMesh* Mesh = nullptr;
	TArray<UMaterialInterface*> Materials;
	TArray<FName> Slots;
	FTransform InCar;
	int32 Corner = -1;   // 0 FL, 1 FR, 2 RL, 3 RR when the part belongs to a wheel
	bool bSpins = false; // tyre/rim (spins) vs brake parts (steer only)
};

struct FSCFabCar
{
	TArray<FSCFabPart> Parts;
	USkeletalMesh* OnePiece = nullptr; // cars that are a single skeletal mesh (the hypercar)
	TArray<UMaterialInterface*> OnePieceMaterials;
	TArray<FName> OnePieceSlots;
	FTransform OnePieceInCar;
	FVector Wheels[4];
	float Length = 450.f, Height = 145.f; // (its meshes and materials are kept loaded for the whole game)
};

namespace SCCars
{
	enum EFlags : uint32 { Paint = 1, Glass = 2, TwoSided = 4, TailLight = 8, Lamp = 16 };

	/** The model for a body type ("hatch", "suv", ...), loaded once; null if its data file is missing. */
	const FSCCarModel* Get(const FString& Body, bool bHighDetail);

	/** Every body type that has a model. */
	TArray<FString> Bodies();

	/** Builds the body (Part 0) or one wheel (Part 1) as a procedural mesh attached to Parent. */
	UProceduralMeshComponent* Build(const FSCCarModel& Model, uint32 Part, USceneComponent* Parent, const FLinearColor& PaintColor, bool bCastShadow);

	/** Linear colour from "#rrggbb". */
	FLinearColor ParseColor(const FString& Hex);

	/** The Fab vehicle blueprint ClassPath read into a car (cached; spawns it out of sight once). Null if missing. */
	const FSCFabCar* GetFab(UWorld* World, const FString& ClassPath);

	/** Builds a Fab car under Root in Paint. Wheel parts go on WheelParents[corner] (spinning) and brake parts on
	 *  SteerParents[corner] (both may be Root); those parents must sit at Fab.Wheels[corner]. */
	void BuildFab(const FSCFabCar& Fab, USceneComponent* Root, const TArray<USceneComponent*>& WheelParents, const TArray<USceneComponent*>& SteerParents,
		const FLinearColor& PaintColor, bool bCastShadow, TArray<UPrimitiveComponent*>& OutParts);
}
