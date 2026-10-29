// Runs the rideshare/delivery loop for Story and Free Ride: offers jobs, tracks pickup and drop-off,
// rates the driving and pays through the economy subsystem. Spawned automatically by ASCHUD if the
// level doesn't contain one, so the only level setup is placing ASCDestination actors.
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "SCTypes.h"
#include "SCJobDirector.generated.h"

class ASCDestination;
class USCEconomySubsystem;

struct FSCToast
{
	FString Text;
	float Remaining = 3.f;
	FLinearColor Color = FLinearColor::White;
};

UCLASS()
class SHIFTCITYCORE_API ASCJobDirector : public AActor
{
	GENERATED_BODY()
public:
	ASCJobDirector();
	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;

	/** Story Mode uses the chapters in Data/story.json; Free Ride generates random jobs. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Shift City") bool bStoryMode = true;
	UPROPERTY(EditAnywhere, Category = "Shift City") float OfferDelay = 2.f;

	UFUNCTION(BlueprintCallable, Category = "Shift City") void Accept();
	UFUNCTION(BlueprintCallable, Category = "Shift City") void Decline();
	UFUNCTION(BlueprintCallable, Category = "Shift City") void ToggleMode();
	/** Starts Story or Free Ride from the main menu. */
	void StartMode(bool bStory);
	/** While the menu is open no requests come in. */
	void SetMenuOpen(bool bOpen) { bMenuOpen = bOpen; }

	bool HasJob() const { return bHasJob; }
	const FSCJob& GetJob() const { return Job; }
	ASCDestination* GetTarget() const;
	float GetHoldProgress() const;
	bool IsNearTarget() const { return bNearTarget; }
	const TArray<FSCToast>& GetToasts() const { return Toasts; }
	/** Story intro/outro line currently on screen (empty when none). */
	const FString& GetStoryCard() const { return StoryCard; }
	int32 NumDestinations() const { return Destinations.Num(); }
	void Toast(const FString& Text, const FLinearColor& Color = FLinearColor::White, float Seconds = 3.f);

private:
	bool bMenuOpen = false;
	void NextOffer();
	void Arrive();
	APawn* PlayerPawn() const;
	USCEconomySubsystem* Economy() const;
	ASCDestination* FindByName(const FString& Name) const;
	void ShowMarker();

	UFUNCTION() void OnPawnHit(AActor* SelfActor, AActor* OtherActor, FVector NormalImpulse, const FHitResult& Hit);

	UPROPERTY() TArray<TObjectPtr<ASCDestination>> Destinations;
	UPROPERTY() FSCJob Job;
	bool bHasJob = false;
	bool bNearTarget = false;
	bool bWarnedNoDestinations = false;
	float OfferTimer = 1.f;
	float Hold = 0.f;
	float Clock = 0.f;
	float BumpCooldown = 0.f;
	float StoryCardTime = 0.f;
	FString StoryCard;
	FVector LastPos = FVector::ZeroVector;
	bool bHasLastPos = false;
	TWeakObjectPtr<APawn> BoundPawn;
	TArray<FSCToast> Toasts;
};
