// Slate (C++-only, no assets) screens for Shift City: the main menu for now, in the same rounded,
// translucent style as the web game so the HUD redesign can share it.
#pragma once

#include "CoreMinimal.h"
#include "Widgets/SWidget.h"

/** What the in-game HUD panels show; ASCHUD fills it every frame and the widgets read it. */
struct FSCHudModel
{
	bool bVisible = true;
	bool bCareer = false;
	FString Money, Level, Stats;
	float Xp = 0.f;
	bool bCard = false;
	FString Tag, Title, Line1, Line2, Fare, Keys;
	FLinearColor TagColor = FLinearColor::White;
	/** GPS banner (top-centre): next instruction, distance, arrow angle (0 = straight ahead, + = right). */
	bool bGps = false;
	FString GpsMain, GpsSub;
	float GpsAngle = 0.f;
	FLinearColor GpsColor = FLinearColor::White;
	/** Boarding / arriving bar while stopped at a pickup or drop-off. */
	bool bBoard = false;
	FString BoardText;
	float BoardProgress = 0.f;
	/** Our own speedometer (bottom-right), replacing the Vehicle template's. */
	bool bSpeed = false;
	FString Speed, Gear;
	/** Story intro card (first line = title); empty = hidden. */
	FString Story;
	static constexpr int32 MaxToasts = 3;
	FString Toast[MaxToasts];
	FLinearColor ToastColor[MaxToasts];
};

namespace SCMenu
{
	struct FMenuInfo
	{
		int32 StoryChapter = 0;
		int32 StoryTotal = 5;
		FString Wallet;
		int32 Level = 1;
	};

	enum class EChoice : uint8 { Story, FreeRide, Arcade, Quit, Garage, Goals, Settings };

	/** One row of a list screen (garage car, goal, setting): text on the left, an action button on the right. */
	struct FRow
	{
		FString Title, Sub, Button;
		bool bEnabled = true;
		/** Highlight the row (the car you're driving, a goal ready to claim). */
		bool bHighlight = false;
		/** 0..1 progress bar under the text, or < 0 for none. */
		float Progress = -1.f;
		TFunction<void()> OnClick;
		/** A section heading instead of a normal row. */
		bool bHeading = false;
	};

	/** Full-screen list (Garage, Goals, Settings) in the menu's style, with a Back button. */
	TSharedRef<SWidget> MakeListScreen(const FString& Title, const FString& Subtitle, const TArray<FRow>& Rows, TFunction<void()> OnBack);

	/** Full-screen main menu. OnChoose is called with the button the player clicked. */
	TSharedRef<SWidget> MakeMainMenu(const FMenuInfo& Info, TFunction<void(EChoice)> OnChoose);


	/** Career panel, job card, story card and toasts in the menu's rounded style. */
	TSharedRef<SWidget> MakeHud(TSharedRef<FSCHudModel> Model);
}
