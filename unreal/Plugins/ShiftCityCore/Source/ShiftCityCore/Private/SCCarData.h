// Car models exported from the browser version (web/scripts/export-cars.ts, Data/Cars/*.bin) and built
// here as procedural meshes: the player's garage car (USCCarVisuals) and the traffic use the same designs.
#pragma once

#include "CoreMinimal.h"

class UProceduralMeshComponent;
class USceneComponent;

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
	float WheelBase = 260.f, Track = 150.f, WheelRadius = 33.f, Length = 450.f;
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
}
