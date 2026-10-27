// Code-drawn HUD (no UMG assets needed): career panel, job card, GPS arrow, objective marker,
// boarding progress, story cards, toasts and speed. Set as the HUD class in your Game Mode.
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/HUD.h"
#include "Fonts/SlateFontInfo.h"
#include "SCCityLayout.h"
#include "SCHUD.generated.h"

class ASCJobDirector;
class UFont;
class ASCDestination;
class ASCTraffic;

UCLASS()
class SHIFTCITYCORE_API ASCHUD : public AHUD
{
	GENERATED_BODY()
public:
	virtual void BeginPlay() override;
	virtual void DrawHUD() override;

	/** Turn on if your vehicle has no speedometer of its own. */
	UPROPERTY(EditAnywhere, Category = "Shift City") bool bShowSpeed = false; // the Vehicle template already shows gear + speed

	/** Show traffic as dots on the minimap (off: a clean map like a real GPS). */
	UPROPERTY(EditAnywhere, Category = "Shift City") bool bShowTrafficOnMinimap = false;

	/** Overall HUD size (text and panels). 1 = original size; raise it if text is hard to read. */
	UPROPERTY(EditAnywhere, Category = "Shift City", meta = (ClampMin = "0.5", ClampMax = "3.0")) float UIScale = 1.5f;

private:
	void Panel(float X, float Y, float W, float H);
	void Label(const FString& Text, float X, float Y, const FLinearColor& Color, float Scale, bool bCentre = false);
	void Arrow(float CX, float CY, float AngleDeg, float Size, const FLinearColor& Color);
	FVector2D TextSize(const FString& Text, float Scale) const;
	FSlateFontInfo Font(float Scale) const;

	void DrawMinimap(APawn* Pawn, float CamYaw, ASCDestination* Target, bool bDropoff);

	UPROPERTY() TObjectPtr<UFont> HudFont;
	TWeakObjectPtr<ASCJobDirector> Director;
	TWeakObjectPtr<ASCTraffic> Traffic;
	SC::FRoute Route;
	bool bHasRoute = false;
	float RouteTimer = 0.f;
	TWeakObjectPtr<ASCDestination> RouteTarget;
	float S = 1.f; // UI scale
};
