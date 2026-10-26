#include "SCHUD.h"
#include "SCDestination.h"
#include "SCEconomySubsystem.h"
#include "SCJobDirector.h"
#include "SCSaveGame.h"
#include "Engine/Canvas.h"
#include "Engine/Engine.h"
#include "Engine/Font.h"
#include "Engine/GameInstance.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "GameFramework/Pawn.h"
#include "GameFramework/PlayerController.h"
#include "Camera/PlayerCameraManager.h"

namespace
{
	const FLinearColor PanelBg(0.04f, 0.07f, 0.11f, 0.78f);
	const FLinearColor Accent(0.3f, 0.94f, 0.69f);
	const FLinearColor Gold(1.f, 0.81f, 0.29f);
	const FLinearColor Muted(0.62f, 0.7f, 0.78f);
}

void ASCHUD::BeginPlay()
{
	Super::BeginPlay();
	for (TActorIterator<ASCJobDirector> It(GetWorld()); It; ++It) { Director = *It; break; }
	if (!Director.IsValid()) Director = GetWorld()->SpawnActor<ASCJobDirector>();
}

FVector2D ASCHUD::TextSize(const FString& Text, float Scale) const
{
	float W = 0, H = 0;
	GetTextSize(Text, W, H, GEngine->GetLargeFont(), Scale);
	return FVector2D(W, H);
}

void ASCHUD::Panel(float X, float Y, float W, float H) { DrawRect(PanelBg, X, Y, W, H); }

void ASCHUD::Label(const FString& Text, float X, float Y, const FLinearColor& Color, float Scale, bool bCentre)
{
	if (bCentre) X -= TextSize(Text, Scale * S).X / 2.f;
	DrawText(Text, Color, X, Y, GEngine->GetLargeFont(), Scale * S);
}

void ASCHUD::Arrow(float CX, float CY, float AngleDeg, float Size, const FLinearColor& Color)
{
	// AngleDeg: 0 = straight ahead (up on screen), positive = to the right
	const float A = FMath::DegreesToRadians(AngleDeg);
	const FVector2D Fwd(FMath::Sin(A), -FMath::Cos(A)), Right(FMath::Cos(A), FMath::Sin(A));
	const FVector2D C(CX, CY);
	const FVector2D Tip = C + Fwd * Size, L = C - Fwd * Size * 0.6f - Right * Size * 0.7f, R = C - Fwd * Size * 0.6f + Right * Size * 0.7f, Notch = C - Fwd * Size * 0.25f;
	const float T = 4.f * S;
	DrawLine(Tip.X, Tip.Y, L.X, L.Y, Color, T);
	DrawLine(Tip.X, Tip.Y, R.X, R.Y, Color, T);
	DrawLine(L.X, L.Y, Notch.X, Notch.Y, Color, T);
	DrawLine(R.X, R.Y, Notch.X, Notch.Y, Color, T);
}

void ASCHUD::DrawHUD()
{
	Super::DrawHUD();
	if (!Canvas) return;
	S = FMath::Max(0.8f, Canvas->ClipY / 1080.f) * UIScale;
	const float W = Canvas->ClipX, H = Canvas->ClipY, Pad = 20.f * S;
	UGameInstance* GI = GetGameInstance();
	USCEconomySubsystem* E = GI ? GI->GetSubsystem<USCEconomySubsystem>() : nullptr;
	ASCJobDirector* D = Director.Get();
	APlayerController* PC = GetOwningPlayerController();
	APawn* Pawn = PC ? PC->GetPawn() : nullptr;

	// ---- career panel (top-left)
	if (E && E->GetSave())
	{
		const USCSaveGame* Sv = E->GetSave();
		Panel(Pad, Pad, 300 * S, 118 * S);
		Label(FString::Printf(TEXT("$%.2f"), Sv->Wallet), Pad + 16 * S, Pad + 10 * S, Accent, 1.6f);
		Label(FString::Printf(TEXT("LV %d"), Sv->Level), Pad + 16 * S, Pad + 58 * S, FLinearColor::White, 0.8f);
		const float Bx = Pad + 80 * S, Bw = 200 * S, By = Pad + 66 * S;
		DrawRect(FLinearColor(1, 1, 1, 0.12f), Bx, By, Bw, 7 * S);
		DrawRect(Accent, Bx, By, Bw * FMath::Clamp(float(Sv->Xp) / E->XpToNext(Sv->Level), 0.f, 1.f), 7 * S);
		Label(FString::Printf(TEXT("Rating %.2f  -  %d trips  -  %.1f km"), Sv->Rating, Sv->Trips, Sv->Km), Pad + 16 * S, Pad + 86 * S, Muted, 0.65f);
	}

	// ---- job card (top-right)
	if (D)
	{
		const float Cw = 430 * S, Cx = W - Cw - Pad;
		if (!D->HasJob())
		{
			Panel(Cx, Pad, Cw, 70 * S);
			Label(D->bStoryMode ? TEXT("STORY MODE") : TEXT("ONLINE - FREE RIDE"), Cx + 16 * S, Pad + 10 * S, Accent, 0.6f);
			Label(TEXT("Waiting for the next request..."), Cx + 16 * S, Pad + 34 * S, FLinearColor::White, 0.85f);
		}
		else
		{
			const FSCJob& J = D->GetJob();
			const FLinearColor TagC = J.Premium ? Gold : Accent;
			const FString Kind = J.Food ? TEXT("FOOD DELIVERY") : J.Premium ? TEXT("PREMIUM RIDE") : TEXT("RIDE REQUEST");
			if (J.Stage == ESCJobStage::Offer)
			{
				Panel(Cx, Pad, Cw, 200 * S);
				Label(FString(J.Chapter >= 0 ? TEXT("STORY - ") : TEXT("NEW ")) + Kind, Cx + 16 * S, Pad + 10 * S, TagC, 0.6f);
				Label(J.Food ? FString::Printf(TEXT("%s -> %s"), *J.Restaurant, *J.B->DisplayName) : J.Customer, Cx + 16 * S, Pad + 34 * S, FLinearColor::White, 0.95f);
				Label(FString::Printf(TEXT("Pickup: %s"), *J.A->DisplayName), Cx + 16 * S, Pad + 72 * S, Muted, 0.7f);
				Label(FString::Printf(TEXT("Drop-off: %s"), *J.B->DisplayName), Cx + 16 * S, Pad + 96 * S, Muted, 0.7f);
				const float Fare = E ? J.Fare * E->GetSelectedVehicle().Fare : J.Fare;
				Label(FString::Printf(TEXT("$%.2f"), Fare), Cx + 16 * S, Pad + 122 * S, FLinearColor::White, 1.3f);
				Label(J.Chapter >= 0 ? TEXT("ENTER  accept") : TEXT("ENTER  accept      N  decline"), Cx + 16 * S, Pad + 168 * S, Accent, 0.7f);
			}
			else if (ASCDestination* T = D->GetTarget())
			{
				const bool bPick = J.Stage == ESCJobStage::Pickup;
				Panel(Cx, Pad, Cw, 96 * S);
				Label(bPick ? (J.Food ? TEXT("> COLLECT ORDER") : TEXT("> PICK UP PASSENGER")) : (J.Food ? TEXT("> DELIVER ORDER") : TEXT("> DROP OFF PASSENGER")), Cx + 16 * S, Pad + 10 * S, bPick ? Accent : Gold, 0.6f);
				Label(T->DisplayName, Cx + 16 * S, Pad + 34 * S, FLinearColor::White, 0.95f);
				Label(bPick ? FString::Printf(TEXT("%s %s"), J.Food ? TEXT("Order for") : TEXT("Passenger:"), *J.Customer) : FString(TEXT("Drive smoothly - bumps cost stars")), Cx + 16 * S, Pad + 66 * S, Muted, 0.65f);

				// ---- GPS arrow + distance (top-centre), relative to where the camera faces
				if (Pawn && PC->PlayerCameraManager)
				{
					const FVector To = T->GetActorLocation() - Pawn->GetActorLocation();
					const float Yaw = FMath::RadiansToDegrees(FMath::Atan2(To.Y, To.X));
					const float Rel = FRotator::NormalizeAxis(Yaw - PC->PlayerCameraManager->GetCameraRotation().Yaw);
					const float Cx2 = W / 2.f;
					Panel(Cx2 - 150 * S, Pad, 300 * S, 84 * S);
					Arrow(Cx2 - 105 * S, Pad + 42 * S, Rel, 24 * S, bPick ? Accent : Gold);
					const float Metres = To.Size2D() / 100.f;
					Label(Metres > 950.f ? FString::Printf(TEXT("%.1f km"), Metres / 1000.f) : FString::Printf(TEXT("%.0f m"), FMath::RoundToFloat(Metres / 10.f) * 10.f), Cx2 - 60 * S, Pad + 14 * S, FLinearColor::White, 1.f);
					Label(bPick ? TEXT("to pickup") : TEXT("to drop-off"), Cx2 - 60 * S, Pad + 50 * S, Muted, 0.6f);

					// ---- on-screen objective marker, clamped to the screen edge when off-screen
					const FVector World = T->GetActorLocation() + FVector(0, 0, 350.f);
					const FVector CamLoc = PC->PlayerCameraManager->GetCameraLocation();
					const bool bBehind = FVector::DotProduct(World - CamLoc, PC->PlayerCameraManager->GetCameraRotation().Vector()) < 0.f;
					FVector Scr = Project(World);
					FVector2D P2(Scr.X, Scr.Y);
					if (bBehind) P2 = FVector2D(W - P2.X, H - P2.Y);
					const bool bOn = !bBehind && P2.X > 40 && P2.X < W - 40 && P2.Y > 40 && P2.Y < H - 40;
					const FVector2D Cn(W / 2.f, H / 2.f);
					if (!bOn)
					{
						FVector2D Dir = (P2 - Cn).GetSafeNormal();
						if (Dir.IsNearlyZero()) Dir = FVector2D(0, 1);
						const float K = FMath::Min((W / 2.f - 60 * S) / FMath::Max(0.001f, FMath::Abs(Dir.X)), (H / 2.f - 80 * S) / FMath::Max(0.001f, FMath::Abs(Dir.Y)));
						P2 = Cn + Dir * K;
						Arrow(P2.X, P2.Y, FMath::RadiansToDegrees(FMath::Atan2(Dir.X, -Dir.Y)), 22 * S, bPick ? Accent : Gold);
					}
					else
					{
						Arrow(P2.X, P2.Y, 180.f, 18 * S, bPick ? Accent : Gold);
						Label(T->DisplayName, P2.X, P2.Y - 52 * S, FLinearColor::White, 0.7f, true);
					}
				}
			}
		}

		// ---- boarding progress
		if (D->IsNearTarget() && D->HasJob() && D->GetJob().Stage != ESCJobStage::Offer)
		{
			const float Bw = 360 * S, Bx = W / 2.f - Bw / 2.f, By = H * 0.62f;
			Panel(Bx, By, Bw, 56 * S);
			const float Prog = D->GetHoldProgress();
			const bool bSlow = Pawn && Pawn->GetVelocity().Size() / 100.f < (E ? E->GetBalance().StopSpeed : 2.5f);
			Label(bSlow ? (D->GetJob().Stage == ESCJobStage::Pickup ? TEXT("Boarding...") : TEXT("Arriving...")) : TEXT("Stop inside the ring"), W / 2.f, By + 8 * S, FLinearColor::White, 0.75f, true);
			DrawRect(FLinearColor(1, 1, 1, 0.12f), Bx + 16 * S, By + 40 * S, Bw - 32 * S, 6 * S);
			DrawRect(Accent, Bx + 16 * S, By + 40 * S, (Bw - 32 * S) * Prog, 6 * S);
		}

		// ---- story card
		if (!D->GetStoryCard().IsEmpty())
		{
			TArray<FString> Lines;
			D->GetStoryCard().ParseIntoArrayLines(Lines);
			const float Bw = 760 * S, Bx = W / 2.f - Bw / 2.f, By = 130 * S;
			Panel(Bx, By, Bw, (24 + Lines.Num() * 32) * S);
			for (int32 i = 0; i < Lines.Num(); ++i) Label(Lines[i], W / 2.f, By + (12 + i * 32) * S, i == 0 ? Accent : FLinearColor::White, i == 0 ? 0.65f : 0.8f, true);
		}

		// ---- toasts
		const TArray<FSCToast>& Ts = D->GetToasts();
		for (int32 i = 0; i < Ts.Num(); ++i)
		{
			const float Ty = H * 0.3f + i * 44 * S;
			const float Tw = TextSize(Ts[i].Text, 0.75f * S).X + 32 * S;
			FLinearColor C = Ts[i].Color; C.A = FMath::Clamp(Ts[i].Remaining * 2.f, 0.f, 1.f);
			DrawRect(FLinearColor(PanelBg.R, PanelBg.G, PanelBg.B, PanelBg.A * C.A), W / 2.f - Tw / 2.f, Ty, Tw, 38 * S);
			Label(Ts[i].Text, W / 2.f, Ty + 6 * S, C, 0.75f, true);
		}
	}

	// ---- speed (bottom-right)
	if (bShowSpeed && Pawn)
	{
		const float Kmh = Pawn->GetVelocity().Size() * 0.036f;
		Panel(W - 190 * S - Pad, H - 100 * S - Pad, 190 * S, 100 * S);
		Label(FString::Printf(TEXT("%.0f"), Kmh), W - 110 * S - Pad, H - 96 * S - Pad, FLinearColor::White, 1.8f, true);
		Label(TEXT("km/h"), W - 110 * S - Pad, H - 40 * S - Pad, Muted, 0.6f, true);
	}
}
