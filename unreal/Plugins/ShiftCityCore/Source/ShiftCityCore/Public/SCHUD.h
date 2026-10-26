// Code-drawn HUD (no UMG assets needed): career panel, job card, GPS arrow, objective marker,
// boarding progress, story cards, toasts and speed. Set as the HUD class in your Game Mode.
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/HUD.h"
#include "SCHUD.generated.h"

class ASCJobDirector;

UCLASS()
class SHIFTCITYCORE_API ASCHUD : public AHUD
{
	GENERATED_BODY()
public:
	virtual void BeginPlay() override;
	virtual void DrawHUD() override;

	/** Set false to hide the speedometer if your vehicle already shows one. */
	UPROPERTY(EditAnywhere, Category = "Shift City") bool bShowSpeed = true;

	/** Overall HUD size (text and panels). 1 = original size; raise it if text is hard to read. */
	UPROPERTY(EditAnywhere, Category = "Shift City", meta = (ClampMin = "0.5", ClampMax = "3.0")) float UIScale = 1.5f;

private:
	void Panel(float X, float Y, float W, float H);
	void Label(const FString& Text, float X, float Y, const FLinearColor& Color, float Scale, bool bCentre = false);
	void Arrow(float CX, float CY, float AngleDeg, float Size, const FLinearColor& Color);
	FVector2D TextSize(const FString& Text, float Scale) const;

	TWeakObjectPtr<ASCJobDirector> Director;
	float S = 1.f; // UI scale
};
