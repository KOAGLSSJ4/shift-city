// Persistent progression. Mirrors the browser save (v5 schema) so balances mean the same in both.
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/SaveGame.h"
#include "SCTypes.h"
#include "SCSaveGame.generated.h"

UCLASS()
class SHIFTCITYCORE_API USCSaveGame : public USaveGame
{
	GENERATED_BODY()
public:
	UPROPERTY(SaveGame) int32 Version = 1;
	UPROPERTY(SaveGame) float Wallet = 0.f;
	UPROPERTY(SaveGame) int32 Xp = 0;
	UPROPERTY(SaveGame) int32 Level = 1;
	UPROPERTY(SaveGame) TArray<FString> Owned;
	UPROPERTY(SaveGame) FString Selected = TEXT("classic");
	UPROPERTY(SaveGame) TMap<FString, FSCUpgrades> Upgrades;
	UPROPERTY(SaveGame) int32 ArcadeBest = 0;
	UPROPERTY(SaveGame) int32 ArcadePoints = 0;
	UPROPERTY(SaveGame) int32 ArcadeRuns = 0;
	UPROPERTY(SaveGame) FString LastArcadeRunId;
	UPROPERTY(SaveGame) int32 StoryChapter = 0;
	UPROPERTY(SaveGame) int32 Trips = 0;
	UPROPERTY(SaveGame) float Earned = 0.f;
	UPROPERTY(SaveGame) float Km = 0.f;
	UPROPERTY(SaveGame) int32 Food = 0;
	UPROPERTY(SaveGame) int32 NearMisses = 0;
	UPROPERTY(SaveGame) float Rating = 4.9f;
	UPROPERTY(SaveGame) int32 Ratings = 1;
	UPROPERTY(SaveGame) TArray<FString> PaidJobs;
	UPROPERTY(SaveGame) TArray<FString> ClaimedGoals;
	UPROPERTY(SaveGame) bool TutorialDone = false;
	/** Settings screen: master volume 0..1. */
	UPROPERTY(SaveGame) float Volume = 1.f;
};
