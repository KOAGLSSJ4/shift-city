// Data definitions shared with the browser version. The JSON files in Plugins/ShiftCityCore/Data are
// exported from the browser repo (scripts/export-data.ts) so both versions use one set of numbers.
#pragma once

#include "CoreMinimal.h"
#include "SCTypes.generated.h"

class ASCDestination;

USTRUCT(BlueprintType)
struct FSCVehicleDef
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly) FString Id;
	UPROPERTY(BlueprintReadOnly) FString Name;
	UPROPERTY(BlueprintReadOnly) FString Kind;
	UPROPERTY(BlueprintReadOnly) int32 Level = 1;
	UPROPERTY(BlueprintReadOnly) float Cost = 0.f;
	UPROPERTY(BlueprintReadOnly) FString Color;
	UPROPERTY(BlueprintReadOnly) FString Body;
	UPROPERTY(BlueprintReadOnly) float Fare = 1.f;      // fare multiplier
	UPROPERTY(BlueprintReadOnly) float Arcade = 1.f;    // arcade score multiplier
	UPROPERTY(BlueprintReadOnly) int32 Seats = 4;
	UPROPERTY(BlueprintReadOnly) int32 Comfort = 2;     // 1..5, affects tips
	UPROPERTY(BlueprintReadOnly) int32 Premium = 0;     // 0 standard, 1 premium jobs, 2 VIP jobs
	UPROPERTY(BlueprintReadOnly) float Accel = 5.f;     // m/s2
	UPROPERTY(BlueprintReadOnly) float TopSpeed = 40.f; // m/s
	UPROPERTY(BlueprintReadOnly) float Brake = 9.f;
	UPROPERTY(BlueprintReadOnly) float Grip = 1.f;
	UPROPERTY(BlueprintReadOnly) float Steer = 0.6f;
};

USTRUCT(BlueprintType)
struct FSCUpgradeTrack
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly) FString Id;
	UPROPERTY(BlueprintReadOnly) FString Label;
	UPROPERTY(BlueprintReadOnly) FString Blurb;
};

USTRUCT()
struct FSCVehicleFile
{
	GENERATED_BODY()
	UPROPERTY() int32 MaxUpgrade = 5;
	UPROPERTY() TArray<FSCUpgradeTrack> UpgradeTracks;
	UPROPERTY() TArray<FSCVehicleDef> Vehicles;
};

USTRUCT(BlueprintType)
struct FSCStoryChapter
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly) FString Title;
	UPROPERTY(BlueprintReadOnly) FString Desc;
	UPROPERTY(BlueprintReadOnly) FString A;          // pickup destination name
	UPROPERTY(BlueprintReadOnly) FString B;          // drop-off destination name
	UPROPERTY(BlueprintReadOnly) bool Food = false;
	UPROPERTY(BlueprintReadOnly) float Price = 0.f;
	UPROPERTY(BlueprintReadOnly) FString Passenger;
	UPROPERTY(BlueprintReadOnly) FString Intro;
	UPROPERTY(BlueprintReadOnly) FString Outro;
	UPROPERTY(BlueprintReadOnly) float BonusTime = 0.f;
};

USTRUCT()
struct FSCStoryFile
{
	GENERATED_BODY()
	UPROPERTY() TArray<FSCStoryChapter> Chapters;
};

USTRUCT(BlueprintType)
struct FSCGoalDef
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly) FString Id;
	UPROPERTY(BlueprintReadOnly) FString Name;
	UPROPERTY(BlueprintReadOnly) float Goal = 1.f;
	UPROPERTY(BlueprintReadOnly) float Reward = 0.f;
	UPROPERTY(BlueprintReadOnly) int32 Xp = 0;
	UPROPERTY(BlueprintReadOnly) FString Kind; // trips | food | distance | arcade | story | cars | nearmiss
};

USTRUCT()
struct FSCGoalFile
{
	GENERATED_BODY()
	UPROPERTY() TArray<FSCGoalDef> Goals;
};

USTRUCT(BlueprintType)
struct FSCBalance
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly) float ArcadePointsPerUnit = 100.f;
	UPROPERTY(BlueprintReadOnly) float CashPerUnit = 8.f;
	UPROPERTY(BlueprintReadOnly) int32 XpPerJob = 30;
	UPROPERTY(BlueprintReadOnly) int32 XpPerStoryChapter = 55;
	UPROPERTY(BlueprintReadOnly) float BaseFare = 7.f;
	UPROPERTY(BlueprintReadOnly) float FarePerMetre = 0.045f;
	UPROPERTY(BlueprintReadOnly) float PickupRadius = 800.f; // cm
	UPROPERTY(BlueprintReadOnly) float StopSpeed = 2.5f;     // m/s
	UPROPERTY(BlueprintReadOnly) float BoardTime = 0.6f;     // s
	UPROPERTY(BlueprintReadOnly) int32 XpPerLevel = 100;
};

USTRUCT()
struct FSCDestinationInfo
{
	GENERATED_BODY()
	UPROPERTY() FString Name;
	UPROPERTY() FString Landmark;
};

USTRUCT()
struct FSCDestinationFile
{
	GENERATED_BODY()
	UPROPERTY() TArray<FString> Restaurants;
	UPROPERTY() TArray<FSCDestinationInfo> Destinations;
};

USTRUCT(BlueprintType)
struct FSCUpgrades
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly, SaveGame) int32 Engine = 0;
	UPROPERTY(BlueprintReadOnly, SaveGame) int32 Brakes = 0;
	UPROPERTY(BlueprintReadOnly, SaveGame) int32 Handling = 0;
};

UENUM(BlueprintType)
enum class ESCJobStage : uint8
{
	Offer,
	Pickup,
	Dropoff,
	Done
};

USTRUCT(BlueprintType)
struct FSCJob
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly) FString Id;
	UPROPERTY(BlueprintReadOnly) bool Food = false;
	UPROPERTY(BlueprintReadOnly) TObjectPtr<ASCDestination> A = nullptr;
	UPROPERTY(BlueprintReadOnly) TObjectPtr<ASCDestination> B = nullptr;
	UPROPERTY(BlueprintReadOnly) FString Restaurant;
	UPROPERTY(BlueprintReadOnly) FString Customer;
	UPROPERTY(BlueprintReadOnly) float Fare = 0.f;
	UPROPERTY(BlueprintReadOnly) bool Premium = false;
	UPROPERTY(BlueprintReadOnly) int32 Chapter = -1; // story chapter index, -1 = free ride
	UPROPERTY(BlueprintReadOnly) ESCJobStage Stage = ESCJobStage::Offer;
	UPROPERTY(BlueprintReadOnly) float StartedAt = 0.f;
	UPROPERTY(BlueprintReadOnly) int32 Bumps = 0;
	UPROPERTY(BlueprintReadOnly) float BonusTime = 0.f;
};

USTRUCT(BlueprintType)
struct FSCJobPayment
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly) bool bPaid = false;
	UPROPERTY(BlueprintReadOnly) float Fare = 0.f;
	UPROPERTY(BlueprintReadOnly) float Tip = 0.f;
	UPROPERTY(BlueprintReadOnly) float Total = 0.f;
	UPROPERTY(BlueprintReadOnly) int32 Xp = 0;
	UPROPERTY(BlueprintReadOnly) int32 LevelsGained = 0;
};
