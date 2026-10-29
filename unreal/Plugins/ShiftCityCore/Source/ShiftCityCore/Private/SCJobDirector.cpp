#include "SCJobDirector.h"
#include "SCHUD.h"
#include "SCDestination.h"
#include "SCEconomySubsystem.h"
#include "SCSaveGame.h"
#include "ShiftCityCore.h"
#include "Components/InputComponent.h"
#include "Engine/GameInstance.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "GameFramework/Pawn.h"
#include "GameFramework/PlayerController.h"
#include "InputCoreTypes.h"

namespace
{
	const TCHAR* Names[] = { TEXT("Sam"), TEXT("Priya"), TEXT("Tunde"), TEXT("Lucia"), TEXT("Ken"), TEXT("Amara"), TEXT("Jonas"), TEXT("Mei"), TEXT("Kwame"), TEXT("Sofia"), TEXT("Omar"), TEXT("Hannah"), TEXT("Diego"), TEXT("Zara"), TEXT("Leo"), TEXT("Ifeoma") };
	const TCHAR* Vips[] = { TEXT("Ms. Duval (CEO)"), TEXT("Mr. Adeyemi (VIP)"), TEXT("Lady Hart"), TEXT("Dr. Romano"), TEXT("Sir Bellamy") };
	const FLinearColor PickupColor(0.33f, 1.f, 0.82f);
	const FLinearColor DropoffColor(1.f, 0.7f, 0.28f);
	const FLinearColor Good(0.3f, 0.94f, 0.69f);
}

ASCJobDirector::ASCJobDirector()
{
	PrimaryActorTick.bCanEverTick = true;
}

USCEconomySubsystem* ASCJobDirector::Economy() const
{
	UGameInstance* GI = GetGameInstance();
	return GI ? GI->GetSubsystem<USCEconomySubsystem>() : nullptr;
}

APawn* ASCJobDirector::PlayerPawn() const
{
	APlayerController* PC = GetWorld() ? GetWorld()->GetFirstPlayerController() : nullptr;
	return PC ? PC->GetPawn() : nullptr;
}

void ASCJobDirector::BeginPlay()
{
	Super::BeginPlay();

	if (APlayerController* PC = GetWorld()->GetFirstPlayerController())
	{
		EnableInput(PC);
		if (InputComponent)
		{
			InputComponent->BindKey(EKeys::Enter, IE_Pressed, this, &ASCJobDirector::Accept);
			InputComponent->BindKey(EKeys::Gamepad_FaceButton_Top, IE_Pressed, this, &ASCJobDirector::Accept);
			InputComponent->BindKey(EKeys::N, IE_Pressed, this, &ASCJobDirector::Decline);
			InputComponent->BindKey(EKeys::M, IE_Pressed, this, &ASCJobDirector::ToggleMode);
		}
	}
	USCEconomySubsystem* E = Economy();
	if (E && E->GetSave() && E->GetSave()->StoryChapter >= E->GetStory().Num()) bStoryMode = false;
}

void ASCJobDirector::StartMode(bool bStory)
{
	USCEconomySubsystem* E = Economy();
	if (bStory && E && E->GetSave() && E->GetSave()->StoryChapter >= E->GetStory().Num()) bStory = false;
	bMenuOpen = false;
	if (bHasJob && Job.Stage != ESCJobStage::Offer && bStory == bStoryMode) return; // carry on with the current job
	bStoryMode = bStory;
	bHasJob = false;
	OfferTimer = 1.f;
	Toast(bStoryMode ? TEXT("STORY MODE") : TEXT("FREE RIDE"), Good);
}

ASCDestination* ASCJobDirector::FindByName(const FString& Name) const
{
	for (ASCDestination* D : Destinations) if (D && D->DisplayName.Equals(Name, ESearchCase::IgnoreCase)) return D;
	return nullptr;
}

ASCDestination* ASCJobDirector::GetTarget() const
{
	if (!bHasJob) return nullptr;
	if (Job.Stage == ESCJobStage::Pickup) return Job.A;
	if (Job.Stage == ESCJobStage::Dropoff) return Job.B;
	return nullptr;
}

float ASCJobDirector::GetHoldProgress() const
{
	const USCEconomySubsystem* E = Economy();
	return E ? FMath::Clamp(Hold / FMath::Max(0.1f, E->GetBalance().BoardTime), 0.f, 1.f) : 0.f;
}

void ASCJobDirector::Toast(const FString& Text, const FLinearColor& Color, float Seconds)
{
	Toasts.Add({ Text, Seconds, Color });
	if (Toasts.Num() > 4) Toasts.RemoveAt(0);
}

void ASCJobDirector::NextOffer()
{
	USCEconomySubsystem* E = Economy();
	if (Destinations.Num() < 2)
	{
		// destinations may be spawned by the city generator after this actor starts, so look again
		Destinations.Reset();
		for (TActorIterator<ASCDestination> It(GetWorld()); It; ++It) Destinations.Add(*It);
		if (Destinations.Num() < 2)
		{
			if (!bWarnedNoDestinations) Toast(TEXT("No pickup points yet: add an SC City Generator or SC Destination actors"), FLinearColor(1.f, 0.4f, 0.4f), 10.f);
			bWarnedNoDestinations = true;
			OfferTimer = 2.f;
			return;
		}
	}
	if (!E) return;
	const FSCVehicleDef Car = E->GetSelectedVehicle();
	Job = FSCJob();
	Job.Id = FGuid::NewGuid().ToString();

	const TArray<FSCStoryChapter> Story = E->GetStory();
	const int32 Ch = E->GetSave()->StoryChapter;
	UE_LOG(LogShiftCity, Log, TEXT("[ShiftCity] %s: new %s offer (menu open %d)"), *GetName(), bStoryMode ? TEXT("story") : TEXT("free ride"), bMenuOpen ? 1 : 0);
	if (bStoryMode && Story.IsValidIndex(Ch))
	{
		const FSCStoryChapter& C = Story[Ch];
		Job.A = FindByName(C.A);
		Job.B = FindByName(C.B);
		if (Job.A && Job.B)
		{
			Job.Chapter = Ch; Job.Food = C.Food; Job.Fare = C.Price; Job.Customer = C.Passenger;
			Job.Restaurant = C.Food ? TEXT("Noodle Street") : TEXT(""); Job.Premium = Ch >= 4; Job.BonusTime = C.BonusTime;
			StoryCard = FString::Printf(TEXT("%s\n%s\n%s"), *C.Title, *C.Passenger, *C.Intro);
			StoryCardTime = 8.f;
			bHasJob = true;
			return;
		}
		Toast(FString::Printf(TEXT("Story needs destinations named \"%s\" and \"%s\" - using a free ride job"), *C.A, *C.B), FLinearColor(1.f, 0.6f, 0.3f), 6.f);
	}
	else if (bStoryMode)
	{
		bStoryMode = false;
		Toast(TEXT("Story complete! Keep earning in Free Ride."), Good, 5.f);
	}

	// free ride: pick up near the player
	const APawn* P = PlayerPawn();
	TArray<ASCDestination*> Sorted;
	for (ASCDestination* D : Destinations) if (D) Sorted.Add(D);
	if (P) Sorted.Sort([P](const ASCDestination& X, const ASCDestination& Y) { return FVector::DistSquared(X.GetActorLocation(), P->GetActorLocation()) < FVector::DistSquared(Y.GetActorLocation(), P->GetActorLocation()); });
	Job.A = Sorted[FMath::RandRange(0, FMath::Min(2, Sorted.Num() - 1))];
	do { Job.B = Sorted[FMath::RandRange(0, Sorted.Num() - 1)]; } while (Job.B == Job.A);
	Job.Food = FMath::FRand() < 0.42f;
	const TArray<FString>& Rest = E->GetRestaurants();
	if (Job.Food) Job.Restaurant = Rest.Num() ? Rest[FMath::RandRange(0, Rest.Num() - 1)] : TEXT("Burger House");
	Job.Premium = !Job.Food && Car.Premium > 0 && FMath::FRand() < (Car.Premium == 2 ? 0.55f : 0.35f);
	Job.Customer = Job.Premium ? Vips[FMath::RandRange(0, UE_ARRAY_COUNT(Vips) - 1)] : Names[FMath::RandRange(0, UE_ARRAY_COUNT(Names) - 1)];
	const float Metres = FVector::Dist2D(Job.A->GetActorLocation(), Job.B->GetActorLocation()) / 100.f;
	Job.Fare = E->JobFare(Metres * 1.3f, Job.Premium) + FMath::RoundToFloat(FMath::FRand() * 500.f) / 100.f;
	bHasJob = true;
}

void ASCJobDirector::Accept()
{
	if (!bHasJob || Job.Stage != ESCJobStage::Offer) return;
	Job.Stage = ESCJobStage::Pickup;
	Job.StartedAt = Clock;
	ShowMarker();
	Toast(Job.Food ? FString::Printf(TEXT("Collect the order at %s"), *Job.A->DisplayName) : FString::Printf(TEXT("Pick up %s at %s"), *Job.Customer, *Job.A->DisplayName), Good);
}

void ASCJobDirector::Decline()
{
	if (!bHasJob || Job.Stage != ESCJobStage::Offer || Job.Chapter >= 0) return;
	bHasJob = false;
	OfferTimer = 1.5f;
	Toast(TEXT("Request declined - finding another..."));
}

void ASCJobDirector::ToggleMode()
{
	// M opens the main menu (where you pick Story or Free Ride)
	if (bHasJob && Job.Stage != ESCJobStage::Offer) { Toast(TEXT("Finish the current job first")); return; }
	APlayerController* PC = GetWorld()->GetFirstPlayerController();
	if (ASCHUD* Hud = PC ? Cast<ASCHUD>(PC->GetHUD()) : nullptr) Hud->ShowMenu();
}

void ASCJobDirector::ShowMarker()
{
	for (ASCDestination* D : Destinations) if (D) D->SetMarker(false, FLinearColor::White);
	if (ASCDestination* T = GetTarget()) T->SetMarker(true, Job.Stage == ESCJobStage::Pickup ? PickupColor : DropoffColor);
}

void ASCJobDirector::OnPawnHit(AActor* SelfActor, AActor* OtherActor, FVector NormalImpulse, const FHitResult& Hit)
{
	if (BumpCooldown > 0.f || NormalImpulse.Size() < 250000.f) return; // ignore scrapes; ~1.5 t car at >2 m/s
	BumpCooldown = 1.f;
	if (bHasJob && Job.Stage == ESCJobStage::Dropoff)
	{
		Job.Bumps++;
		Toast(TEXT("Ouch! Your passenger felt that (-stars)"), FLinearColor(1.f, 0.45f, 0.45f), 2.f);
	}
}

void ASCJobDirector::Tick(float Dt)
{
	Super::Tick(Dt);
	Clock += Dt;
	BumpCooldown = FMath::Max(0.f, BumpCooldown - Dt);
	for (int32 i = Toasts.Num() - 1; i >= 0; --i) if ((Toasts[i].Remaining -= Dt) <= 0.f) Toasts.RemoveAt(i);
	if (StoryCardTime > 0.f && (StoryCardTime -= Dt) <= 0.f) StoryCard.Reset();

	APawn* P = PlayerPawn();
	USCEconomySubsystem* E = Economy();
	if (!P || !E) return;
	if (BoundPawn.Get() != P)
	{
		if (APawn* Old = BoundPawn.Get()) Old->OnActorHit.RemoveDynamic(this, &ASCJobDirector::OnPawnHit);
		P->OnActorHit.AddDynamic(this, &ASCJobDirector::OnPawnHit);
		BoundPawn = P;
		bHasLastPos = false;
	}
	// odometer for goals
	const FVector Pos = P->GetActorLocation();
	if (bHasLastPos) E->AddDistance(FVector::Dist2D(Pos, LastPos) / 100.f);
	LastPos = Pos; bHasLastPos = true;

	if (!bHasJob) { if (!bMenuOpen && (OfferTimer -= Dt) <= 0.f) NextOffer(); return; }
	ASCDestination* T = GetTarget();
	if (!T) return;
	const float Dist = FVector::Dist2D(Pos, T->GetActorLocation());
	const float SpeedMs = P->GetVelocity().Size() / 100.f;
	bNearTarget = Dist < T->Radius + 300.f;
	if (Dist < T->Radius && SpeedMs < E->GetBalance().StopSpeed)
	{
		Hold += Dt;
		if (Hold >= E->GetBalance().BoardTime) { Hold = 0.f; Arrive(); }
	}
	else Hold = 0.f;
}

void ASCJobDirector::Arrive()
{
	USCEconomySubsystem* E = Economy();
	if (Job.Stage == ESCJobStage::Pickup)
	{
		Job.Stage = ESCJobStage::Dropoff;
		ShowMarker();
		Toast(Job.Food ? FString::Printf(TEXT("Order collected from %s - deliver to %s"), *Job.Restaurant, *Job.B->DisplayName)
		               : FString::Printf(TEXT("%s is on board - drive to %s"), *Job.Customer, *Job.B->DisplayName), Good);
		return;
	}
	if (Job.Stage != ESCJobStage::Dropoff || !E) return;
	Job.Stage = ESCJobStage::Done;
	ShowMarker();
	const FSCVehicleDef Car = E->GetSelectedVehicle();
	const float Stars = FMath::Clamp(5.f - Job.Bumps * (0.55f - Car.Comfort * 0.05f), 1.f, 5.f);
	const float Elapsed = Clock - Job.StartedAt;
	const float Bonus = (Job.BonusTime > 0.f && Elapsed < Job.BonusTime) ? FMath::RoundToFloat(Job.Fare * 0.25f) : 0.f;
	const int32 Ch = Job.Chapter;
	const FSCJobPayment Pay = E->PayJob(Job.Id, Job.Fare, Job.Food, Stars, Ch >= 0, Bonus);
	if (Pay.bPaid)
	{
		Toast(FString::Printf(TEXT("+$%.2f   Rating %.1f%s   +%d XP"), Pay.Total, Stars, Pay.Tip > 0.f ? *FString::Printf(TEXT("  (tip $%.2f)"), Pay.Tip) : TEXT(""), Pay.Xp), Good, 4.f);
		if (Pay.LevelsGained > 0) Toast(FString::Printf(TEXT("LEVEL UP! Level %d"), E->GetSave()->Level), FLinearColor(1.f, 0.81f, 0.29f), 4.f);
	}
	if (Ch >= 0 && E->GetStory().IsValidIndex(Ch))
	{
		StoryCard = FString::Printf(TEXT("%s - COMPLETE\n%s"), *E->GetStory()[Ch].Title, *E->GetStory()[Ch].Outro);
		StoryCardTime = 6.f;
	}
	bHasJob = false;
	OfferTimer = OfferDelay;
}
