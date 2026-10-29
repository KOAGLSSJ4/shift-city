#include "SCMenu.h"
#include "Brushes/SlateRoundedBoxBrush.h"
#include "Styling/CoreStyle.h"
#include "Styling/SlateTypes.h"
#include "Widgets/Input/SButton.h"
#include "Widgets/Layout/SBorder.h"
#include "Widgets/Layout/SBox.h"
#include "Widgets/SBoxPanel.h"
#include "Widgets/SOverlay.h"
#include "Widgets/Text/STextBlock.h"

namespace
{
	const FLinearColor MenuAccent(0.3f, 0.94f, 0.69f);
	const FLinearColor MenuInk(0.04f, 0.07f, 0.11f, 0.9f);
	const FLinearColor MenuMuted(0.62f, 0.7f, 0.78f);

	const FSlateBrush* PanelBrush()
	{
		static const FSlateRoundedBoxBrush Brush(MenuInk, 22.f, FLinearColor(0.3f, 0.94f, 0.69f, 0.35f), 1.5f);
		return &Brush;
	}

	const FButtonStyle* MenuButtonStyle(bool bPrimary)
	{
		static FButtonStyle Primary, Secondary;
		static bool bReady = false;
		if (!bReady)
		{
			bReady = true;
			auto Make = [](FButtonStyle& Style, const FLinearColor& Fill, const FLinearColor& Hover)
			{
				Style = FButtonStyle()
					.SetNormal(FSlateRoundedBoxBrush(Fill, 14.f, FLinearColor(1.f, 1.f, 1.f, 0.1f), 1.f))
					.SetHovered(FSlateRoundedBoxBrush(Hover, 14.f, MenuAccent, 1.5f))
					.SetPressed(FSlateRoundedBoxBrush(Fill * 0.8f, 14.f, MenuAccent, 1.5f))
					.SetDisabled(FSlateRoundedBoxBrush(FLinearColor(0.1f, 0.12f, 0.15f, 0.6f), 14.f, FLinearColor(1.f, 1.f, 1.f, 0.06f), 1.f))
					.SetNormalPadding(FMargin(0.f))
					.SetPressedPadding(FMargin(0.f));
			};
			Make(Primary, FLinearColor(0.12f, 0.42f, 0.32f, 0.95f), FLinearColor(0.16f, 0.52f, 0.4f, 1.f));
			Make(Secondary, FLinearColor(0.1f, 0.15f, 0.21f, 0.95f), FLinearColor(0.14f, 0.2f, 0.28f, 1.f));
		}
		return bPrimary ? &Primary : &Secondary;
	}

	FSlateFontInfo MenuFont(const char* Style, int32 Size) { return FCoreStyle::GetDefaultFontStyle(Style, Size); }
}

TSharedRef<SWidget> SCMenu::MakeMainMenu(const FMenuInfo& Info, TFunction<void(EChoice)> OnChoose)
{
	auto MakeButton = [&OnChoose](EChoice Choice, const FString& Title, const FString& Sub, bool bPrimary, bool bEnabled) -> TSharedRef<SWidget>
	{
		return SNew(SButton)
			.ButtonStyle(MenuButtonStyle(bPrimary))
			.IsEnabled(bEnabled)
			.ContentPadding(FMargin(22.f, 12.f))
			.OnClicked_Lambda([OnChoose, Choice]() { OnChoose(Choice); return FReply::Handled(); })
			[
				SNew(SVerticalBox)
				+ SVerticalBox::Slot().AutoHeight()
				[
					SNew(STextBlock).Text(FText::FromString(Title)).Font(MenuFont("Bold", 20)).ColorAndOpacity(FSlateColor(FLinearColor::White))
				]
				+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 2.f, 0.f, 0.f)
				[
					SNew(STextBlock).Text(FText::FromString(Sub)).Font(MenuFont("Regular", 12)).ColorAndOpacity(FSlateColor(MenuMuted))
				]
			];
	};

	const bool bStoryDone = Info.StoryChapter >= Info.StoryTotal;
	const FString StorySub = bStoryDone ? FString(TEXT("Story complete - replay as Free Ride with bonus jobs"))
		: FString::Printf(TEXT("Chapter %d of %d - learn the city, one job at a time"), Info.StoryChapter + 1, Info.StoryTotal);

	return SNew(SOverlay)
		+ SOverlay::Slot()
		[
			SNew(SBorder)
			.BorderImage(FCoreStyle::Get().GetBrush("WhiteBrush"))
			.BorderBackgroundColor(FLinearColor(0.01f, 0.02f, 0.04f, 0.55f))
		]
		+ SOverlay::Slot().HAlign(HAlign_Center).VAlign(VAlign_Center)
		[
			SNew(SBox).WidthOverride(520.f)
			[
				SNew(SBorder).BorderImage(PanelBrush()).Padding(FMargin(40.f, 32.f))
				[
					SNew(SVerticalBox)
					+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Center)
					[
						SNew(STextBlock).Text(FText::FromString(TEXT("SHIFT CITY"))).Font(MenuFont("Bold", 46)).ColorAndOpacity(FSlateColor(MenuAccent))
					]
					+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Center).Padding(0.f, 2.f, 0.f, 24.f)
					[
						SNew(STextBlock).Text(FText::FromString(TEXT("Drive. Deliver. Get paid."))).Font(MenuFont("Regular", 15)).ColorAndOpacity(FSlateColor(MenuMuted))
					]
					+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 0.f, 0.f, 10.f)
					[ MakeButton(EChoice::Story, TEXT("Story"), StorySub, !bStoryDone, true) ]
					+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 0.f, 0.f, 10.f)
					[ MakeButton(EChoice::FreeRide, TEXT("Free Ride"), TEXT("Take any ride or delivery and build your career"), bStoryDone, true) ]
					+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 0.f, 0.f, 10.f)
					[ MakeButton(EChoice::Arcade, TEXT("Arcade Rush"), TEXT("Coming soon to this version"), false, false) ]
					+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 0.f, 0.f, 18.f)
					[ MakeButton(EChoice::Quit, TEXT("Quit"), TEXT("See you next shift"), false, true) ]
					+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Center)
					[
						SNew(STextBlock)
						.Text(FText::FromString(FString::Printf(TEXT("%s  -  Level %d  -  M opens this menu"), *Info.Wallet, Info.Level)))
						.Font(MenuFont("Regular", 12)).ColorAndOpacity(FSlateColor(MenuMuted))
					]
				]
			]
		];
}
