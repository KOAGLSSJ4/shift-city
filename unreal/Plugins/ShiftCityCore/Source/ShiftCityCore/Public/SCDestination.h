// A pickup / drop-off point. Drag one into the level for each named place (Central Station, Arts
// District, ...) and set Display Name to match the names in Data/destinations.json.
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "SCDestination.generated.h"

class UStaticMeshComponent;
class UTextRenderComponent;
class UMaterialInstanceDynamic;

UCLASS(Blueprintable)
class SHIFTCITYCORE_API ASCDestination : public AActor
{
	GENERATED_BODY()
public:
	ASCDestination();

	/** Must match a name used by jobs/story (see Data/destinations.json). */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Shift City") FString DisplayName = TEXT("Central Station");
	/** Stop-zone radius in cm. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Shift City", meta = (ClampMin = "200")) float Radius = 800.f;

	/** Shows/hides the glowing marker; called by the job director. */
	void SetMarker(bool bShow, const FLinearColor& Color);

	virtual void OnConstruction(const FTransform& Transform) override;
	virtual void BeginPlay() override;

protected:
	UPROPERTY(VisibleAnywhere) TObjectPtr<USceneComponent> Root;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UStaticMeshComponent> Beam;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UStaticMeshComponent> Ring;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UTextRenderComponent> Label;
	UPROPERTY() TObjectPtr<UMaterialInstanceDynamic> Mat;
};
