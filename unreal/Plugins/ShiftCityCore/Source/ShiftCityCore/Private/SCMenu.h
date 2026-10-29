// Slate (C++-only, no assets) screens for Shift City: the main menu for now, in the same rounded,
// translucent style as the web game so the HUD redesign can share it.
#pragma once

#include "CoreMinimal.h"
#include "Widgets/SWidget.h"

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
}
