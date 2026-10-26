// Career, economy and garage rules (port of the browser's gameplay/Economy.ts) plus data loading and
// saving. Lives for the whole game session, so progress survives level and mode changes.
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "SCTypes.h"
#include "SCEconomySubsystem.generated.h"

class USCSaveGame;

DECLARE_DYNAMIC_MULTICAST_DELEGATE(FSCOnEconomyChanged);

UCLASS()
class SHIFTCITYCORE_API USCEconomySubsystem : public UGameInstanceSubsystem
{
	GENERATED_BODY()
public:
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;

	/** Fired after anything that changes money, XP or ownership (for UI). */
	UPROPERTY(BlueprintAssignable) FSCOnEconomyChanged OnChanged;

	// ---- data
	UFUNCTION(BlueprintPure, Category = "Shift City") TArray<FSCVehicleDef> GetVehicles() const { return Vehicles; }
	UFUNCTION(BlueprintPure, Category = "Shift City") TArray<FSCStoryChapter> GetStory() const { return Story; }
	UFUNCTION(BlueprintPure, Category = "Shift City") TArray<FSCGoalDef> GetGoals() const { return Goals; }
	UFUNCTION(BlueprintPure, Category = "Shift City") FSCBalance GetBalance() const { return Balance; }
	const TArray<FString>& GetRestaurants() const { return Restaurants; }
	UFUNCTION(BlueprintPure, Category = "Shift City") FSCVehicleDef GetVehicle(const FString& Id) const;
	UFUNCTION(BlueprintPure, Category = "Shift City") FSCVehicleDef GetSelectedVehicle() const;
	UFUNCTION(BlueprintPure, Category = "Shift City") USCSaveGame* GetSave() const { return Save; }

	// ---- progression
	UFUNCTION(BlueprintPure, Category = "Shift City") int32 XpToNext(int32 Level) const { return Level * Balance.XpPerLevel; }
	/** Adds XP, returns the number of levels gained. */
	UFUNCTION(BlueprintCallable, Category = "Shift City") int32 AddXP(int32 Amount);

	// ---- garage
	UFUNCTION(BlueprintCallable, Category = "Shift City") bool BuyVehicle(const FString& Id, FString& OutMessage);
	UFUNCTION(BlueprintCallable, Category = "Shift City") bool SelectVehicle(const FString& Id, FString& OutMessage);
	UFUNCTION(BlueprintPure, Category = "Shift City") FSCUpgrades GetUpgrades(const FString& Id) const;
	UFUNCTION(BlueprintPure, Category = "Shift City") float UpgradeCost(const FString& Id, int32 CurrentLevel) const;
	/** Track: "engine" | "brakes" | "handling". */
	UFUNCTION(BlueprintCallable, Category = "Shift City") bool BuyUpgrade(const FString& Id, const FString& Track, FString& OutMessage);

	// ---- arcade
	/** 100 arcade points -> $5 (configurable). Only whole units convert. Returns cash added. */
	UFUNCTION(BlueprintCallable, Category = "Shift City") float ConvertArcadePoints();
	/** Records a finished run exactly once per RunId. Returns points awarded. */
	UFUNCTION(BlueprintCallable, Category = "Shift City") int32 RecordArcadeRun(const FString& RunId, int32 Score, int32 NearMisses);

	// ---- jobs
	UFUNCTION(BlueprintPure, Category = "Shift City") float JobFare(float DistanceMetres, bool bPremium) const;
	/** Pays a completed job exactly once per JobId. */
	UFUNCTION(BlueprintCallable, Category = "Shift City") FSCJobPayment PayJob(const FString& JobId, float Fare, bool bFood, float Stars, bool bStory, float BonusTip);
	UFUNCTION(BlueprintCallable, Category = "Shift City") void AddDistance(float Metres);

	// ---- goals
	UFUNCTION(BlueprintPure, Category = "Shift City") float GoalProgress(const FSCGoalDef& Goal) const;
	UFUNCTION(BlueprintCallable, Category = "Shift City") bool ClaimGoal(const FString& GoalId, FString& OutMessage);
	UFUNCTION(BlueprintPure, Category = "Shift City") int32 ClaimableGoals() const;

	// ---- persistence
	UFUNCTION(BlueprintCallable, Category = "Shift City") void SaveNow();
	UFUNCTION(BlueprintCallable, Category = "Shift City") void ResetProgress();

	static const FString SlotName;

private:
	void LoadData();
	void LoadOrCreateSave();
	void Changed();

	UPROPERTY() TObjectPtr<USCSaveGame> Save;
	TArray<FSCVehicleDef> Vehicles;
	TArray<FSCUpgradeTrack> UpgradeTracks;
	int32 MaxUpgrade = 5;
	TArray<FSCStoryChapter> Story;
	TArray<FSCGoalDef> Goals;
	TArray<FString> Restaurants;
	FSCBalance Balance;
};
