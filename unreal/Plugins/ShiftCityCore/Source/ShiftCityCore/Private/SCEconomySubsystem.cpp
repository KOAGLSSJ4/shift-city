#include "SCEconomySubsystem.h"
#include "SCSaveGame.h"
#include "ShiftCityCore.h"
#include "JsonObjectConverter.h"
#include "Interfaces/IPluginManager.h"
#include "Kismet/GameplayStatics.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"

const FString USCEconomySubsystem::SlotName = TEXT("ShiftCity");

namespace
{
	float Round2(float V) { return FMath::RoundToFloat(V * 100.f) / 100.f; }

	template <typename T>
	bool LoadJson(const FString& File, T& Out)
	{
		TSharedPtr<IPlugin> Plugin = IPluginManager::Get().FindPlugin(TEXT("ShiftCityCore"));
		if (!Plugin.IsValid()) return false;
		const FString Path = FPaths::Combine(Plugin->GetBaseDir(), TEXT("Data"), File);
		FString Text;
		if (!FFileHelper::LoadFileToString(Text, *Path))
		{
			UE_LOG(LogShiftCity, Error, TEXT("Missing data file %s"), *Path);
			return false;
		}
		if (!FJsonObjectConverter::JsonObjectStringToUStruct(Text, &Out, 0, 0))
		{
			UE_LOG(LogShiftCity, Error, TEXT("Could not parse %s"), *Path);
			return false;
		}
		return true;
	}
}

void USCEconomySubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);
	LoadData();
	LoadOrCreateSave();
}

void USCEconomySubsystem::LoadData()
{
	FSCVehicleFile VF;
	if (LoadJson(TEXT("vehicles.json"), VF)) { Vehicles = VF.Vehicles; UpgradeTracks = VF.UpgradeTracks; MaxUpgrade = VF.MaxUpgrade; }
	FSCStoryFile SF;
	if (LoadJson(TEXT("story.json"), SF)) Story = SF.Chapters;
	FSCGoalFile GF;
	if (LoadJson(TEXT("goals.json"), GF)) Goals = GF.Goals;
	LoadJson(TEXT("balancing.json"), Balance);
	FSCDestinationFile DF;
	if (LoadJson(TEXT("destinations.json"), DF)) Restaurants = DF.Restaurants;
	if (Vehicles.Num() == 0)
	{
		// keep the game playable even if the data folder is missing
		FSCVehicleDef Starter; Starter.Id = TEXT("classic"); Starter.Name = TEXT("Shift Classic");
		Vehicles.Add(Starter);
	}
	UE_LOG(LogShiftCity, Log, TEXT("Shift City data: %d vehicles, %d chapters, %d goals"), Vehicles.Num(), Story.Num(), Goals.Num());
}

void USCEconomySubsystem::LoadOrCreateSave()
{
	if (UGameplayStatics::DoesSaveGameExist(SlotName, 0))
		Save = Cast<USCSaveGame>(UGameplayStatics::LoadGameFromSlot(SlotName, 0));
	if (!Save)
		Save = Cast<USCSaveGame>(UGameplayStatics::CreateSaveGameObject(USCSaveGame::StaticClass()));
	if (!Save->Owned.Contains(TEXT("classic"))) Save->Owned.Insert(TEXT("classic"), 0);
	if (!Save->Owned.Contains(Save->Selected)) Save->Selected = TEXT("classic");
	Save->Wallet = FMath::Max(0.f, Save->Wallet);
	Save->Level = FMath::Max(1, Save->Level);
}

void USCEconomySubsystem::SaveNow()
{
	if (Save) UGameplayStatics::SaveGameToSlot(Save, SlotName, 0);
}

void USCEconomySubsystem::ResetProgress()
{
	Save = Cast<USCSaveGame>(UGameplayStatics::CreateSaveGameObject(USCSaveGame::StaticClass()));
	Save->Owned.Add(TEXT("classic"));
	SaveNow();
	Changed();
}

void USCEconomySubsystem::Changed()
{
	OnChanged.Broadcast();
}

FSCVehicleDef USCEconomySubsystem::GetVehicle(const FString& Id) const
{
	for (const FSCVehicleDef& V : Vehicles) if (V.Id == Id) return V;
	return Vehicles.Num() ? Vehicles[0] : FSCVehicleDef();
}

FSCVehicleDef USCEconomySubsystem::GetSelectedVehicle() const
{
	return GetVehicle(Save ? Save->Selected : TEXT("classic"));
}

int32 USCEconomySubsystem::AddXP(int32 Amount)
{
	int32 Ups = 0;
	Save->Xp += Amount;
	while (Save->Xp >= XpToNext(Save->Level)) { Save->Xp -= XpToNext(Save->Level); Save->Level++; Ups++; }
	Changed();
	return Ups;
}

bool USCEconomySubsystem::BuyVehicle(const FString& Id, FString& OutMessage)
{
	const FSCVehicleDef V = GetVehicle(Id);
	if (Save->Owned.Contains(Id)) { OutMessage = TEXT("Already owned"); return false; }
	if (Save->Level < V.Level) { OutMessage = FString::Printf(TEXT("Reach level %d to unlock"), V.Level); return false; }
	if (Save->Wallet < V.Cost) { OutMessage = FString::Printf(TEXT("Need $%.0f more"), V.Cost - Save->Wallet); return false; }
	Save->Wallet -= V.Cost;
	Save->Owned.Add(Id);
	Save->Selected = Id;
	OutMessage = FString::Printf(TEXT("%s purchased!"), *V.Name);
	SaveNow(); Changed();
	return true;
}

bool USCEconomySubsystem::SelectVehicle(const FString& Id, FString& OutMessage)
{
	if (!Save->Owned.Contains(Id)) { OutMessage = TEXT("Not owned"); return false; }
	Save->Selected = Id;
	OutMessage = FString::Printf(TEXT("%s equipped"), *GetVehicle(Id).Name);
	SaveNow(); Changed();
	return true;
}

FSCUpgrades USCEconomySubsystem::GetUpgrades(const FString& Id) const
{
	const FSCUpgrades* U = Save ? Save->Upgrades.Find(Id) : nullptr;
	return U ? *U : FSCUpgrades();
}

float USCEconomySubsystem::UpgradeCost(const FString& Id, int32 CurrentLevel) const
{
	const FSCVehicleDef V = GetVehicle(Id);
	return FMath::RoundToFloat((150.f + V.Cost * 0.05f) * (CurrentLevel + 1) / 10.f) * 10.f;
}

bool USCEconomySubsystem::BuyUpgrade(const FString& Id, const FString& Track, FString& OutMessage)
{
	if (!Save->Owned.Contains(Id)) { OutMessage = TEXT("Not owned"); return false; }
	FSCUpgrades U = GetUpgrades(Id);
	int32* Lv = Track == TEXT("engine") ? &U.Engine : Track == TEXT("brakes") ? &U.Brakes : Track == TEXT("handling") ? &U.Handling : nullptr;
	if (!Lv) { OutMessage = TEXT("Unknown upgrade"); return false; }
	if (*Lv >= MaxUpgrade) { OutMessage = TEXT("Maxed out"); return false; }
	const float Cost = UpgradeCost(Id, *Lv);
	if (Save->Wallet < Cost) { OutMessage = FString::Printf(TEXT("Need $%.0f more"), Cost - Save->Wallet); return false; }
	Save->Wallet -= Cost;
	(*Lv)++;
	Save->Upgrades.Add(Id, U);
	OutMessage = FString::Printf(TEXT("%s upgraded to level %d"), *Track, *Lv);
	SaveNow(); Changed();
	return true;
}

float USCEconomySubsystem::ConvertArcadePoints()
{
	const int32 Units = FMath::FloorToInt(Save->ArcadePoints / Balance.ArcadePointsPerUnit);
	if (Units <= 0) return 0.f;
	const float Cash = Units * Balance.CashPerUnit;
	Save->ArcadePoints -= FMath::RoundToInt(Units * Balance.ArcadePointsPerUnit);
	Save->Wallet += Cash;
	SaveNow(); Changed();
	return Cash;
}

int32 USCEconomySubsystem::RecordArcadeRun(const FString& RunId, int32 Score, int32 NearMisses)
{
	if (Save->LastArcadeRunId == RunId) return 0;
	Save->LastArcadeRunId = RunId;
	Save->ArcadeRuns++;
	Save->ArcadeBest = FMath::Max(Save->ArcadeBest, Score);
	Save->ArcadePoints += Score;
	Save->NearMisses += NearMisses;
	SaveNow(); Changed();
	return Score;
}

float USCEconomySubsystem::JobFare(float DistanceMetres, bool bPremium) const
{
	return Round2((Balance.BaseFare + DistanceMetres * Balance.FarePerMetre) * (bPremium ? 1.6f : 1.f));
}

FSCJobPayment USCEconomySubsystem::PayJob(const FString& JobId, float Fare, bool bFood, float Stars, bool bStory, float BonusTip)
{
	FSCJobPayment P;
	if (Save->PaidJobs.Contains(JobId)) return P; // exactly once
	Save->PaidJobs.Add(JobId);
	if (Save->PaidJobs.Num() > 50) Save->PaidJobs.RemoveAt(0, Save->PaidJobs.Num() - 50);
	const FSCVehicleDef V = GetSelectedVehicle();
	P.bPaid = true;
	P.Fare = Round2(Fare * V.Fare);
	P.Tip = Round2((Stars >= 4.5f ? P.Fare * 0.04f * V.Comfort : 0.f) + BonusTip);
	P.Total = P.Fare + P.Tip;
	Save->Wallet += P.Total;
	Save->Earned += P.Total;
	Save->Trips++;
	if (bFood) Save->Food++;
	Save->Rating = (Save->Rating * Save->Ratings + Stars) / (Save->Ratings + 1);
	Save->Ratings = FMath::Min(Save->Ratings + 1, 200);
	P.Xp = Balance.XpPerJob;
	if (bStory && Save->StoryChapter < Story.Num()) { Save->StoryChapter++; P.Xp += Balance.XpPerStoryChapter; }
	P.LevelsGained = AddXP(P.Xp);
	SaveNow(); Changed();
	return P;
}

void USCEconomySubsystem::AddDistance(float Metres)
{
	if (Save && Metres > 0.f) Save->Km += Metres / 1000.f;
}

float USCEconomySubsystem::GoalProgress(const FSCGoalDef& G) const
{
	if (G.Kind == TEXT("trips")) return Save->Trips;
	if (G.Kind == TEXT("food")) return Save->Food;
	if (G.Kind == TEXT("distance")) return Save->Km;
	if (G.Kind == TEXT("arcade")) return Save->ArcadeBest;
	if (G.Kind == TEXT("story")) return Save->StoryChapter;
	if (G.Kind == TEXT("cars")) return Save->Owned.Num();
	if (G.Kind == TEXT("nearmiss")) return Save->NearMisses;
	return 0.f;
}

bool USCEconomySubsystem::ClaimGoal(const FString& GoalId, FString& OutMessage)
{
	const FSCGoalDef* G = Goals.FindByPredicate([&](const FSCGoalDef& X) { return X.Id == GoalId; });
	if (!G) { OutMessage = TEXT("Unknown goal"); return false; }
	if (Save->ClaimedGoals.Contains(GoalId)) { OutMessage = TEXT("Already claimed"); return false; }
	if (GoalProgress(*G) < G->Goal) { OutMessage = TEXT("Not complete yet"); return false; }
	Save->ClaimedGoals.Add(GoalId);
	Save->Wallet += G->Reward;
	AddXP(G->Xp);
	OutMessage = FString::Printf(TEXT("Goal claimed: +$%.0f, +%d XP"), G->Reward, G->Xp);
	SaveNow(); Changed();
	return true;
}

int32 USCEconomySubsystem::ClaimableGoals() const
{
	int32 N = 0;
	for (const FSCGoalDef& G : Goals) if (!Save->ClaimedGoals.Contains(G.Id) && GoalProgress(G) >= G.Goal) N++;
	return N;
}
