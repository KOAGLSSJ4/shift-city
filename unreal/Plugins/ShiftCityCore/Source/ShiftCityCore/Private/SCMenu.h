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

	enum class EChoice : uint8 { Story, FreeRide, Arcade, Quit };

	/** Full-screen main menu. OnChoose is called with the button the player clicked. */
	TSharedRef<SWidget> MakeMainMenu(const FMenuInfo& Info, TFunction<void(EChoice)> OnChoose);


	/** Career panel, job card, story card and toasts in the menu's rounded style. */
	TSharedRef<SWidget> MakeHud(TSharedRef<FSCHudModel> Model);
}
