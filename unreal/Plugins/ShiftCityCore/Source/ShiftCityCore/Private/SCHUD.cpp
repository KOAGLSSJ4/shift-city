#include "SCHUD.h"
#include "SCMenu.h"
#include "ShiftCityCore.h"
#include "Engine/GameViewportClient.h"
#include "SCDestination.h"
#include "SCEconomySubsystem.h"
#include "SCJobDirector.h"
#include "SCSaveGame.h"
#include "SCTraffic.h"
#include "Engine/Canvas.h"
#include "Engine/Engine.h"
#include "Engine/Font.h"
#include "UObject/UObjectGlobals.h"
#include "Engine/GameInstance.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "GameFramework/Pawn.h"
#include "GameFramework/PlayerController.h"
#include "Camera/PlayerCameraManager.h"
#include "Camera/CameraActor.h"
#include "CanvasItem.h"
#include "RenderUtils.h"
#include "UnrealClient.h"
#include "Misc/CommandLine.h"
#include "Misc/Paths.h"
#include "Fonts/FontMeasure.h"
#include "Fonts/SlateFontInfo.h"
#include "Framework/Application/SlateApplication.h"
#include "Rendering/SlateRenderer.h"
#include "Styling/CoreStyle.h"

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
	HudFont = LoadObject<UFont>(nullptr, TEXT("/Engine/EngineFonts/Roboto.Roboto"));
	for (TActorIterator<ASCJobDirector> It(GetWorld()); It; ++It) { Director = *It; break; }
	if (!Director.IsValid()) Director = GetWorld()->SpawnActor<ASCJobDirector>();
	for (TActorIterator<ASCTraffic> It(GetWorld()); It; ++It) { Traffic = *It; break; }
	if (GEngine && GEngine->GameViewport)
	{
		HudModel = MakeShared<FSCHudModel>();
		HudWidget = SCMenu::MakeHud(HudModel.ToSharedRef());
		GEngine->GameViewport->AddViewportWidgetContent(HudWidget.ToSharedRef(), 10);
	}
	ShowMenu();
}

void ASCHUD::EndPlay(const EEndPlayReason::Type Reason)
{
	HideMenu(); // viewport widgets outlive the world in the editor's Play mode
	if (HudWidget.IsValid() && GEngine && GEngine->GameViewport) GEngine->GameViewport->RemoveViewportWidgetContent(HudWidget.ToSharedRef());
	HudWidget.Reset();
	Super::EndPlay(Reason);
}

void ASCHUD::ShowMenu()
{
	if (MenuWidget.IsValid() || !GEngine || !GEngine->GameViewport) return;
	SCMenu::FMenuInfo Info;
	UGameInstance* GI = GetGameInstance();
	if (USCEconomySubsystem* E = GI ? GI->GetSubsystem<USCEconomySubsystem>() : nullptr)
	{
		if (const USCSaveGame* Sv = E->GetSave())
		{
			Info.StoryChapter = Sv->StoryChapter;
			Info.Wallet = FString::Printf(TEXT("$%.2f"), Sv->Wallet);
			Info.Level = Sv->Level;
		}
		Info.StoryTotal = E->GetStory().Num();
	}
	TWeakObjectPtr<ASCHUD> Self(this);
	MenuWidget = SCMenu::MakeMainMenu(Info, [Self](SCMenu::EChoice Choice) { if (Self.IsValid()) Self->OnMenuChoice(uint8(Choice)); });
	GEngine->GameViewport->AddViewportWidgetContent(MenuWidget.ToSharedRef(), 50);
	if (APlayerController* PC = GetOwningPlayerController())
	{
		FInputModeUIOnly Mode;
		Mode.SetWidgetToFocus(MenuWidget);
		PC->SetInputMode(Mode);
		PC->SetShowMouseCursor(true);
	}
	if (ASCJobDirector* D = Director.Get()) D->SetMenuOpen(true);
	UE_LOG(LogShiftCity, Log, TEXT("[ShiftCity] menu: shown (director %s)"), *GetNameSafe(Director.Get()));
}

void ASCHUD::HideMenu()
{
	if (!MenuWidget.IsValid()) return;
	if (GEngine && GEngine->GameViewport) GEngine->GameViewport->RemoveViewportWidgetContent(MenuWidget.ToSharedRef());
	MenuWidget.Reset();
	if (APlayerController* PC = GetOwningPlayerController())
	{
		PC->SetInputMode(FInputModeGameOnly());
		PC->SetShowMouseCursor(false);
	}
}

void ASCHUD::OnMenuChoice(uint8 Choice)
{
	switch (SCMenu::EChoice(Choice))
	{
	case SCMenu::EChoice::Quit:
		if (APlayerController* PC = GetOwningPlayerController()) PC->ConsoleCommand(TEXT("quit"));
		break;
	case SCMenu::EChoice::Arcade:
		break; // not ported yet (button is disabled)
	default:
		HideMenu();
		if (!Director.IsValid()) for (TActorIterator<ASCJobDirector> It(GetWorld()); It; ++It) { Director = *It; break; }
		UE_LOG(LogShiftCity, Log, TEXT("[ShiftCity] menu: chose %s (director %s)"), SCMenu::EChoice(Choice) == SCMenu::EChoice::Story ? TEXT("Story") : TEXT("Free Ride"), *GetNameSafe(Director.Get()));
		if (ASCJobDirector* D = Director.Get()) D->StartMode(SCMenu::EChoice(Choice) == SCMenu::EChoice::Story);
		break;
	}
}

FSlateFontInfo ASCHUD::Font(float Scale) const
{
	// vector font rendered at the exact pixel size needed, so text stays sharp at any UI scale
	const int32 Px = FMath::Clamp(FMath::RoundToInt(30.f * Scale * S), 9, 140);
	// Use the engine's Roboto font asset (a UObject) - Canvas text needs a font object, not just a composite font
	if (HudFont) return FSlateFontInfo(HudFont.Get(), Px, Scale >= 1.2f ? FName("Bold") : FName("Regular"));
	return FCoreStyle::GetDefaultFontStyle(Scale >= 1.2f ? "Bold" : "Regular", Px);
}

FVector2D ASCHUD::TextSize(const FString& Text, float Scale) const
{
	if (FSlateApplication::IsInitialized())
		return FSlateApplication::Get().GetRenderer()->GetFontMeasureService()->Measure(Text, Font(Scale));
	return FVector2D(Text.Len() * 15.f * Scale * S, 30.f * Scale * S);
}

void ASCHUD::Panel(float X, float Y, float W, float H) { DrawRect(PanelBg, X, Y, W, H); }

void ASCHUD::Label(const FString& Text, float X, float Y, const FLinearColor& Color, float Scale, bool bCentre)
{
	if (!Canvas) return;
	if (bCentre) X -= TextSize(Text, Scale).X / 2.f;
	const FSlateFontInfo Info = Font(Scale);
	if (!Info.FontObject)
	{
		// last resort: the classic bitmap font, always available
		DrawText(Text, Color, X, Y, GEngine->GetLargeFont(), Scale * S);
		return;
	}
	FCanvasTextItem Item(FVector2D(X, Y), FText::FromString(Text), Info, Color);
	Item.EnableShadow(FLinearColor(0.f, 0.f, 0.f, 0.65f));
	Item.BlendMode = SE_BLEND_Translucent;
	Canvas->DrawItem(Item);
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

namespace
{
	/** Clips segment A-B to a circle. Returns false if it lies entirely outside. */
	bool ClipToCircle(FVector2D& A, FVector2D& B, const FVector2D& C, float R)
	{
		const FVector2D D = B - A, F = A - C;
		const float a = FVector2D::DotProduct(D, D);
		if (a < 1e-6f) return FVector2D::Distance(A, C) <= R;
		const float b = 2.f * FVector2D::DotProduct(F, D), c = FVector2D::DotProduct(F, F) - R * R;
		const float Disc = b * b - 4.f * a * c;
		if (Disc <= 0.f) return false;
		const float Sq = FMath::Sqrt(Disc);
		const float T0 = FMath::Max(0.f, (-b - Sq) / (2.f * a)), T1 = FMath::Min(1.f, (-b + Sq) / (2.f * a));
		if (T0 >= T1) return false;
		const FVector2D A0 = A;
		A = A0 + D * T0; B = A0 + D * T1;
		return true;
	}
}

void ASCHUD::DrawMinimap(APawn* Pawn, float CamYaw, ASCDestination* Target, bool bDropoff)
{
	// round, heading-up map like an in-car sat-nav
	const float Radius = 105.f * S, Pad = 20.f * S;
	const FVector2D Centre(Pad + Radius, Canvas->ClipY - Pad - Radius);
	const float Scale = Radius / 20000.f; // ~200 m from centre to rim
	const FVector Me = Pawn->GetActorLocation();
	const float Y = FMath::DegreesToRadians(CamYaw);
	const FVector2D F(FMath::Cos(Y), FMath::Sin(Y)), Rt(-FMath::Sin(Y), FMath::Cos(Y));
	auto ToMap = [&](const FVector& P) { const FVector2D R(P.X - Me.X, P.Y - Me.Y); return Centre + FVector2D(FVector2D::DotProduct(R, Rt), -FVector2D::DotProduct(R, F)) * Scale; };
	auto Line = [&](const FVector& A, const FVector& B, const FLinearColor& C, float Thick)
	{
		FVector2D P = ToMap(A), Q = ToMap(B);
		if (ClipToCircle(P, Q, Centre, Radius - Thick * 0.5f)) DrawLine(P.X, P.Y, Q.X, Q.Y, C, Thick);
	};
	// filled disc (triangle fan) + rim
	{
		const int32 Segs = 48;
		TArray<FCanvasUVTri> Tris;
		const FLinearColor Bg(0.08f, 0.12f, 0.16f, 0.82f);
		for (int32 i = 0; i < Segs; ++i)
		{
			const float A0 = 2.f * PI * i / Segs, A1 = 2.f * PI * (i + 1) / Segs;
			FCanvasUVTri T;
			T.V0_Pos = Centre; T.V1_Pos = Centre + FVector2D(FMath::Cos(A0), FMath::Sin(A0)) * Radius; T.V2_Pos = Centre + FVector2D(FMath::Cos(A1), FMath::Sin(A1)) * Radius;
			T.V0_Color = T.V1_Color = T.V2_Color = Bg;
			Tris.Add(T);
		}
		// UE 5.8 asserts on a null texture here, so tint the engine's plain white one
		FCanvasTriangleItem Fan(Tris, GWhiteTexture);
		Fan.BlendMode = SE_BLEND_Translucent;
		Canvas->DrawItem(Fan);
	}
	const float Lo = SC::Road(0) - SC::HW, Hi = SC::Road(SC::Grid) + SC::HW;
	const FLinearColor RoadC(0.37f, 0.45f, 0.53f, 1.f);
	for (int32 K = 0; K <= SC::Grid; ++K)
	{
		const float C = SC::Road(K);
		Line(FVector(Lo, C, 0), FVector(Hi, C, 0), RoadC, FMath::Max(2.f, SC::RoadW * Scale));
		Line(FVector(C, Lo, 0), FVector(C, Hi, 0), RoadC, FMath::Max(2.f, SC::RoadW * Scale));
	}
	if (bHasRoute && Target)
		for (int32 i = 1; i < Route.Points.Num(); ++i) Line(Route.Points[i - 1], Route.Points[i], FLinearColor(0.3f, 0.76f, 1.f), 5.f * S);
	if (ASCTraffic* Tr = bShowTrafficOnMinimap ? Traffic.Get() : nullptr)
	{
		TArray<FVector> Cars;
		Tr->GetCarPositions(Cars);
		for (const FVector& C : Cars)
		{
			const FVector2D P = ToMap(C);
			if (FVector2D::Distance(P, Centre) < Radius - 4 * S) DrawRect(FLinearColor(0.85f, 0.87f, 0.9f), P.X - 2 * S, P.Y - 2 * S, 4 * S, 4 * S);
		}
	}
	if (Target)
	{
		FVector2D P = ToMap(Target->GetActorLocation());
		const FVector2D Off = P - Centre;
		if (Off.Size() > Radius - 9 * S) P = Centre + Off.GetSafeNormal() * (Radius - 9 * S); // pin to the rim
		const FLinearColor C = bDropoff ? FLinearColor(1.f, 0.7f, 0.28f) : FLinearColor(0.33f, 1.f, 0.82f);
		DrawRect(C, P.X - 7 * S, P.Y - 7 * S, 14 * S, 14 * S);
	}
	for (int32 i = 0; i < 48; ++i)
	{
		const float A0 = 2.f * PI * i / 48, A1 = 2.f * PI * (i + 1) / 48;
		const FVector2D P = Centre + FVector2D(FMath::Cos(A0), FMath::Sin(A0)) * Radius, Q = Centre + FVector2D(FMath::Cos(A1), FMath::Sin(A1)) * Radius;
		DrawLine(P.X, P.Y, Q.X, Q.Y, FLinearColor(1.f, 1.f, 1.f, 0.35f), 2.f * S);
	}
	Arrow(Centre.X, Centre.Y, FRotator::NormalizeAxis(Pawn->GetActorRotation().Yaw - CamYaw), 12 * S, FLinearColor(0.3f, 0.94f, 0.69f));
}

void ASCHUD::DrawHUD()
{
	Super::DrawHUD();
	if (!Canvas) return;
	// scale to the smaller of width/height so panels never overlap in narrow editor windows
	S = FMath::Max(0.45f, FMath::Min(Canvas->ClipX / 1920.f, Canvas->ClipY / 1080.f)) * UIScale;
	const float W = Canvas->ClipX, H = Canvas->ClipY, Pad = 20.f * S;
	UGameInstance* GI = GetGameInstance();
	USCEconomySubsystem* E = GI ? GI->GetSubsystem<USCEconomySubsystem>() : nullptr;
	ASCJobDirector* D = Director.Get();
	APlayerController* PC = GetOwningPlayerController();
	APawn* Pawn = PC ? PC->GetPawn() : nullptr;
	// build robot: with -SCShots on the command line, save a few screenshots so visuals can be checked remotely
	static const bool bRobotShots = FParse::Param(FCommandLine::Get(), TEXT("SCShots"));
	if (bRobotShots && RobotShot < 3 && GetWorld() && GetWorld()->GetTimeSeconds() > 12.f + RobotShot * 10.f)
		FScreenshotRequest::RequestScreenshot(FPaths::ProjectSavedDir() / FString::Printf(TEXT("RobotShots/shot_%d.png"), ++RobotShot), true, false);
	// the robot can't click: leave the menu up for the first screenshot, then start Free Ride
	if (bRobotShots && MenuWidget.IsValid() && RobotShot >= 1 && GetWorld()->GetTimeSeconds() > 15.f) OnMenuChoice(uint8(SCMenu::EChoice::FreeRide));
	// after the second shot, follow traffic car 0 so the last shot shows whether traffic renders
	if (bRobotShots && RobotShot >= 2 && PC && GetWorld())
	{
		TActorIterator<ASCTraffic> It(GetWorld());
		TArray<FVector> CarPos;
		if (It) It->GetCarPositions(CarPos);
		if (CarPos.Num() > 0)
		{
			const FVector Eye = CarPos[0] + FVector(-600.f, -600.f, 400.f);
			if (!RobotCam)
			{
				RobotCam = GetWorld()->SpawnActor<ACameraActor>(Eye, (CarPos[0] - Eye).Rotation());
				if (RobotCam) PC->SetViewTarget(RobotCam);
			}
			if (RobotCam) RobotCam->SetActorLocationAndRotation(Eye, (CarPos[0] - Eye).Rotation());
		}
	}

	FSCHudModel Dummy;
	FSCHudModel& Hm = HudModel.IsValid() ? *HudModel : Dummy;
	Hm.bVisible = !MenuWidget.IsValid();
	Hm.bCareer = Hm.bCard = Hm.bGps = Hm.bBoard = false;
	Hm.Story.Reset();
	for (FString& ToastText : Hm.Toast) ToastText.Reset();
	if (MenuWidget.IsValid()) return; // the menu covers the screen: no HUD under it

	// ---- career panel (top-left)
	if (E && E->GetSave())
	{
		const USCSaveGame* Sv = E->GetSave();
		Hm.bCareer = true;
		Hm.Money = FString::Printf(TEXT("$%.2f"), Sv->Wallet);
		Hm.Level = FString::Printf(TEXT("LV %d"), Sv->Level);
		Hm.Xp = float(Sv->Xp) / FMath::Max(1, E->XpToNext(Sv->Level));
		Hm.Stats = FString::Printf(TEXT("Rating %.2f  -  %d trips  -  %.1f km"), Sv->Rating, Sv->Trips, Sv->Km);
	}

	// ---- job card (top-right)
	if (D)
	{
		Hm.bCard = true;
		Hm.TagColor = Accent;
		Hm.Line1.Reset(); Hm.Line2.Reset(); Hm.Fare.Reset(); Hm.Keys.Reset();
		if (!D->HasJob())
		{
			Hm.Tag = D->bStoryMode ? TEXT("STORY MODE") : TEXT("ONLINE - FREE RIDE");
			Hm.Title = TEXT("Waiting for the next request...");
		}
		else
		{
			const FSCJob& J = D->GetJob();
			const FString Kind = J.Food ? TEXT("FOOD DELIVERY") : J.Premium ? TEXT("PREMIUM RIDE") : TEXT("RIDE REQUEST");
			Hm.TagColor = J.Premium ? Gold : Accent;
			if (J.Stage == ESCJobStage::Offer)
			{
				Hm.Tag = FString(J.Chapter >= 0 ? TEXT("STORY - ") : TEXT("NEW ")) + Kind;
				Hm.Title = J.Food ? FString::Printf(TEXT("%s -> %s"), *J.Restaurant, *J.B->DisplayName) : J.Customer;
				Hm.Line1 = FString::Printf(TEXT("Pickup: %s"), *J.A->DisplayName);
				Hm.Line2 = FString::Printf(TEXT("Drop-off: %s"), *J.B->DisplayName);
				Hm.Fare = FString::Printf(TEXT("$%.2f"), E ? J.Fare * E->GetSelectedVehicle().Fare : J.Fare);
				Hm.Keys = J.Chapter >= 0 ? TEXT("[ENTER] accept") : TEXT("[ENTER] accept     [N] decline");
			}
			else if (ASCDestination* T = D->GetTarget())
			{
				const bool bPick = J.Stage == ESCJobStage::Pickup;
				Hm.TagColor = bPick ? Accent : Gold;
				Hm.Tag = bPick ? (J.Food ? TEXT("COLLECT ORDER") : TEXT("PICK UP PASSENGER")) : (J.Food ? TEXT("DELIVER ORDER") : TEXT("DROP OFF PASSENGER"));
				Hm.Title = T->DisplayName;
				Hm.Line1 = bPick ? FString::Printf(TEXT("%s %s"), J.Food ? TEXT("Order for") : TEXT("Passenger:"), *J.Customer) : FString(TEXT("Drive smoothly - bumps cost stars"));

				// ---- GPS arrow + distance (top-centre), relative to where the camera faces
				if (Pawn && PC->PlayerCameraManager)
				{
					// street-aware GPS: follow the road route, not a straight line
					if ((RouteTimer -= GetWorld()->GetDeltaSeconds()) <= 0.f || RouteTarget.Get() != T)
					{
						RouteTimer = 0.25f;
						RouteTarget = T;
						Route = SC::FindRoute(Pawn->GetActorLocation(), Pawn->GetActorForwardVector(), T->GetActorLocation());
						bHasRoute = true;
					}
					// aim the arrow at a point ~25 m ahead along the route
					FVector Aim = T->GetActorLocation();
					{
						float Acc = 0.f;
						for (int32 i = 1; i < Route.Points.Num(); ++i)
						{
							const float Seg = FVector::Dist2D(Route.Points[i - 1], Route.Points[i]);
							if (Acc + Seg >= 2500.f) { Aim = FMath::Lerp(Route.Points[i - 1], Route.Points[i], (2500.f - Acc) / FMath::Max(1.f, Seg)); break; }
							Acc += Seg;
						}
					}
					const FVector To = Aim - Pawn->GetActorLocation();
					const float Yaw = FMath::RadiansToDegrees(FMath::Atan2(To.Y, To.X));
					const float Rel = FRotator::NormalizeAxis(Yaw - PC->PlayerCameraManager->GetCameraRotation().Yaw);
					auto Dist = [](float Cm) { const float M = Cm / 100.f; return M > 950.f ? FString::Printf(TEXT("%.1f km"), M / 1000.f) : FString::Printf(TEXT("%.0f m"), FMath::RoundToFloat(M / 10.f) * 10.f); };
					FString Instr;
					switch (Route.Next)
					{
					case SC::ETurn::Left: Instr = FString::Printf(TEXT("Turn left in %s"), *Dist(Route.NextDist)); break;
					case SC::ETurn::Right: Instr = FString::Printf(TEXT("Turn right in %s"), *Dist(Route.NextDist)); break;
					case SC::ETurn::UTurn: Instr = TEXT("Make a U-turn"); break;
					default: Instr = FString::Printf(TEXT("Arrive in %s"), *Dist(Route.NextDist)); break;
					}
					Hm.bGps = true;
					Hm.GpsMain = Instr;
					Hm.GpsSub = FString::Printf(TEXT("%s to %s"), *Dist(Route.Length), bPick ? TEXT("pickup") : TEXT("drop-off"));
					Hm.GpsAngle = Rel;
					Hm.GpsColor = bPick ? Accent : Gold;

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
			const bool bSlow = Pawn && Pawn->GetVelocity().Size() / 100.f < (E ? E->GetBalance().StopSpeed : 2.5f);
			Hm.bBoard = true;
			Hm.BoardProgress = D->GetHoldProgress();
			Hm.BoardText = bSlow ? (D->GetJob().Stage == ESCJobStage::Pickup ? TEXT("Boarding...") : TEXT("Arriving...")) : TEXT("Stop inside the ring");
		}

		// ---- story card + toasts (drawn by the Slate HUD)
		Hm.Story = D->GetStoryCard();
		const TArray<FSCToast>& Ts = D->GetToasts();
		for (int32 i = 0; i < FMath::Min(Ts.Num(), FSCHudModel::MaxToasts); ++i)
		{
			Hm.Toast[i] = Ts[i].Text;
			Hm.ToastColor[i] = Ts[i].Color;
			Hm.ToastColor[i].A = FMath::Clamp(Ts[i].Remaining * 2.f, 0.f, 1.f);
		}
	}

	// ---- minimap (bottom-left), heading-up
	if (Pawn && PC && PC->PlayerCameraManager) DrawMinimap(Pawn, PC->PlayerCameraManager->GetCameraRotation().Yaw, D ? D->GetTarget() : nullptr, D && D->HasJob() && D->GetJob().Stage == ESCJobStage::Dropoff);

	// ---- speed (bottom-right)
	if (bShowSpeed && Pawn)
	{
		const float Kmh = Pawn->GetVelocity().Size() * 0.036f;
		Panel(W - 190 * S - Pad, H - 100 * S - Pad, 190 * S, 100 * S);
		Label(FString::Printf(TEXT("%.0f"), Kmh), W - 110 * S - Pad, H - 96 * S - Pad, FLinearColor::White, 1.8f, true);
		Label(TEXT("km/h"), W - 110 * S - Pad, H - 40 * S - Pad, Muted, 0.6f, true);
	}
}
