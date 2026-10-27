// Builds the Shift City streets procedurally (port of the browser version's world/City.ts):
// a 10 x 10 block grid with roads, markings, kerbs, sidewalks, buildings with shopfronts, parks,
// street props, and the ten named pickup points. Drop one in a level (the setup script does this).
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "SCCityGenerator.generated.h"

class UProceduralMeshComponent;
class UHierarchicalInstancedStaticMeshComponent;
class UMaterialInterface;
class UStaticMesh;

UCLASS()
class SHIFTCITYCORE_API ASCCityGenerator : public AActor
{
	GENERATED_BODY()
public:
	ASCCityGenerator();

	virtual void OnConstruction(const FTransform& Transform) override;
	virtual void BeginPlay() override;

	/** Rebuilds the city (also happens automatically when placed or edited). */
	UFUNCTION(CallInEditor, BlueprintCallable, Category = "Shift City") void Generate();

	UPROPERTY(EditAnywhere, Category = "Shift City") int32 Seed = 1337;

	// ---- materials (assigned by Scripts/setup_shift_city.py)
	UPROPERTY(EditAnywhere, Category = "Shift City|Materials") TObjectPtr<UMaterialInterface> Asphalt;
	UPROPERTY(EditAnywhere, Category = "Shift City|Materials") TObjectPtr<UMaterialInterface> Sidewalk;
	UPROPERTY(EditAnywhere, Category = "Shift City|Materials") TObjectPtr<UMaterialInterface> Kerb;
	UPROPERTY(EditAnywhere, Category = "Shift City|Materials") TObjectPtr<UMaterialInterface> PaintWhite;
	UPROPERTY(EditAnywhere, Category = "Shift City|Materials") TObjectPtr<UMaterialInterface> PaintYellow;
	UPROPERTY(EditAnywhere, Category = "Shift City|Materials") TObjectPtr<UMaterialInterface> Roof;
	UPROPERTY(EditAnywhere, Category = "Shift City|Materials") TObjectPtr<UMaterialInterface> Grass;
	UPROPERTY(EditAnywhere, Category = "Shift City|Materials") TArray<TObjectPtr<UMaterialInterface>> Facades;
	UPROPERTY(EditAnywhere, Category = "Shift City|Materials") TArray<TObjectPtr<UMaterialInterface>> Shopfronts;

	// ---- props (optional; empty = skipped)
	/** All parts of the street-lamp model (imported models can be split into several meshes). */
	UPROPERTY(EditAnywhere, Category = "Shift City|Props") TArray<TObjectPtr<UStaticMesh>> LampMeshes;
	UPROPERTY(EditAnywhere, Category = "Shift City|Props") float LampScale = 1.25f;
	/** All parts of the street-tree model (e.g. trunk + leaves). */
	UPROPERTY(EditAnywhere, Category = "Shift City|Props") TArray<TObjectPtr<UStaticMesh>> TreeMeshes;
	UPROPERTY(EditAnywhere, Category = "Shift City|Props") float TreeScale = 1.6f;
	UPROPERTY(EditAnywhere, Category = "Shift City|Props") TObjectPtr<UStaticMesh> HydrantMesh;
	UPROPERTY(EditAnywhere, Category = "Shift City|Props") TObjectPtr<UStaticMesh> BinMesh;

	/** Spawns the ten named SC Destinations when play starts (skips any you placed yourself). */
	UPROPERTY(EditAnywhere, Category = "Shift City") bool bSpawnDestinations = true;

	/** Bumped whenever the generator changes, so the setup script can tell if the C++ was rebuilt. */
	UFUNCTION(BlueprintPure, Category = "Shift City") static int32 GetGeneratorVersion() { return 3; }

	/** Where the player should start (next to Central Station, facing along the road). */
	UFUNCTION(BlueprintPure, Category = "Shift City") FTransform GetSpawnTransform() const;

private:
	UPROPERTY(VisibleAnywhere) TObjectPtr<UProceduralMeshComponent> Mesh;   // buildings, roofs, kerbs (cast shadows)
	UPROPERTY(VisibleAnywhere) TObjectPtr<UProceduralMeshComponent> Ground; // ground, roads, paint, sidewalks (no shadows)
	void AddPropInstances(const TArray<TObjectPtr<UStaticMesh>>& Meshes, const TArray<FTransform>& Ts, bool bCollide);
	UPROPERTY(VisibleAnywhere) TObjectPtr<UHierarchicalInstancedStaticMeshComponent> Hydrants;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UHierarchicalInstancedStaticMeshComponent> Bins;
};
