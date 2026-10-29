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
#include "Layout/Visibility.h"
#include "Widgets/Layout/SDPIScaler.h"

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

namespace
{
	const FSlateBrush* HudPanelBrush()
	{
		static const FSlateRoundedBoxBrush Brush(FLinearColor(0.04f, 0.07f, 0.11f, 0.8f), 16.f, FLinearColor(1.f, 1.f, 1.f, 0.08f), 1.f);
		return &Brush;
	}
	const FSlateBrush* BarBrush(bool bFill)
	{
		static const FSlateRoundedBoxBrush Bg(FLinearColor(1.f, 1.f, 1.f, 0.14f), 3.f);
		static const FSlateRoundedBoxBrush Fill(MenuAccent, 3.f);
		return bFill ? &Fill : &Bg;
	}
}

TSharedRef<SWidget> SCMenu::MakeHud(TSharedRef<FSCHudModel> Model)
{
	const TSharedRef<FSCHudModel> M = Model;
	auto Text = [M](FString FSCHudModel::* Field) { return TAttribute<FText>::CreateLambda([M, Field]() { return FText::FromString((*M).*Field); }); };
	auto ShownIf = [](TFunction<bool()> Test) { return TAttribute<EVisibility>::CreateLambda([Test]() { return Test() ? EVisibility::HitTestInvisible : EVisibility::Collapsed; }); };
	const float BarW = 170.f;

	TSharedRef<SVerticalBox> ToastBox = SNew(SVerticalBox);
	for (int32 i = 0; i < FSCHudModel::MaxToasts; ++i)
	{
		ToastBox->AddSlot().AutoHeight().HAlign(HAlign_Center).Padding(0.f, 0.f, 0.f, 6.f)
		[
			SNew(SBorder).BorderImage(HudPanelBrush()).Padding(FMargin(16.f, 7.f))
			.Visibility(ShownIf([M, i]() { return !M->Toast[i].IsEmpty(); }))
			[
				SNew(STextBlock).Font(MenuFont("Bold", 15))
				.Text_Lambda([M, i]() { return FText::FromString(M->Toast[i]); })
				.ColorAndOpacity_Lambda([M, i]() { return FSlateColor(M->ToastColor[i]); })
			]
		];
	}

	// a touch bigger than Slate's default so it reads well on a laptop at a glance
	return SNew(SDPIScaler).DPIScale(1.3f)
		[
		SNew(SOverlay)
		.Visibility(ShownIf([M]() { return M->bVisible; }))
		// career (top-left)
		+ SOverlay::Slot().HAlign(HAlign_Left).VAlign(VAlign_Top).Padding(20.f)
		[
			SNew(SBorder).BorderImage(HudPanelBrush()).Padding(FMargin(18.f, 12.f))
			.Visibility(ShownIf([M]() { return M->bCareer; }))
			[
				SNew(SVerticalBox)
				+ SVerticalBox::Slot().AutoHeight()
				[ SNew(STextBlock).Font(MenuFont("Bold", 30)).ColorAndOpacity(FSlateColor(MenuAccent)).Text(Text(&FSCHudModel::Money)) ]
				+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 2.f, 0.f, 4.f)
				[
					SNew(SHorizontalBox)
					+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center).Padding(0.f, 0.f, 10.f, 0.f)
					[ SNew(STextBlock).Font(MenuFont("Bold", 14)).ColorAndOpacity(FSlateColor(FLinearColor::White)).Text(Text(&FSCHudModel::Level)) ]
					+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center)
					[
						SNew(SBox).WidthOverride(BarW).HeightOverride(6.f)
						[
							SNew(SOverlay)
							+ SOverlay::Slot()[ SNew(SBorder).BorderImage(BarBrush(false)) ]
							+ SOverlay::Slot().HAlign(HAlign_Left)
							[
								SNew(SBox).WidthOverride_Lambda([M, BarW]() { return FOptionalSize(BarW * FMath::Clamp(M->Xp, 0.f, 1.f)); })
								[ SNew(SBorder).BorderImage(BarBrush(true)) ]
							]
						]
					]
				]
				+ SVerticalBox::Slot().AutoHeight()
				[ SNew(STextBlock).Font(MenuFont("Regular", 12)).ColorAndOpacity(FSlateColor(MenuMuted)).Text(Text(&FSCHudModel::Stats)) ]
			]
		]
		// job card (top-right)
		+ SOverlay::Slot().HAlign(HAlign_Right).VAlign(VAlign_Top).Padding(20.f)
		[
			SNew(SBox).MinDesiredWidth(360.f).MaxDesiredWidth(520.f)
			.Visibility(ShownIf([M]() { return M->bCard; }))
			[
				SNew(SBorder).BorderImage(HudPanelBrush()).Padding(FMargin(18.f, 14.f))
				[
					SNew(SVerticalBox)
					+ SVerticalBox::Slot().AutoHeight()
					[
						SNew(STextBlock).Font(MenuFont("Bold", 12)).Text(Text(&FSCHudModel::Tag))
						.ColorAndOpacity_Lambda([M]() { return FSlateColor(M->TagColor); })
					]
					+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 2.f, 0.f, 6.f)
					[ SNew(STextBlock).Font(MenuFont("Bold", 22)).AutoWrapText(true).ColorAndOpacity(FSlateColor(FLinearColor::White)).Text(Text(&FSCHudModel::Title)) ]
					+ SVerticalBox::Slot().AutoHeight()
					[ SNew(STextBlock).Font(MenuFont("Regular", 14)).ColorAndOpacity(FSlateColor(MenuMuted)).Text(Text(&FSCHudModel::Line1)).Visibility(ShownIf([M]() { return !M->Line1.IsEmpty(); })) ]
					+ SVerticalBox::Slot().AutoHeight()
					[ SNew(STextBlock).Font(MenuFont("Regular", 14)).ColorAndOpacity(FSlateColor(MenuMuted)).Text(Text(&FSCHudModel::Line2)).Visibility(ShownIf([M]() { return !M->Line2.IsEmpty(); })) ]
					+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 6.f, 0.f, 0.f)
					[ SNew(STextBlock).Font(MenuFont("Bold", 30)).ColorAndOpacity(FSlateColor(FLinearColor::White)).Text(Text(&FSCHudModel::Fare)).Visibility(ShownIf([M]() { return !M->Fare.IsEmpty(); })) ]
					+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 6.f, 0.f, 0.f)
					[ SNew(STextBlock).Font(MenuFont("Bold", 13)).ColorAndOpacity(FSlateColor(MenuAccent)).Text(Text(&FSCHudModel::Keys)).Visibility(ShownIf([M]() { return !M->Keys.IsEmpty(); })) ]
				]
			]
		]
		// GPS banner (top-centre)
		+ SOverlay::Slot().HAlign(HAlign_Center).VAlign(VAlign_Top).Padding(20.f)
		[
			SNew(SBorder).BorderImage(HudPanelBrush()).Padding(FMargin(16.f, 10.f, 22.f, 10.f))
			.Visibility(ShownIf([M]() { return M->bGps; }))
			[
				SNew(SHorizontalBox)
				+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center).Padding(0.f, 0.f, 14.f, 0.f)
				[
					SNew(SBox).WidthOverride(40.f).HeightOverride(40.f).HAlign(HAlign_Center).VAlign(VAlign_Center)
					[
						SNew(STextBlock).Text(FText::FromString(TEXT("\u2191"))).Font(MenuFont("Bold", 30))
						.ColorAndOpacity_Lambda([M]() { return FSlateColor(M->GpsColor); })
						.RenderTransformPivot(FVector2D(0.5f, 0.5f))
						.RenderTransform_Lambda([M]() { return TOptional<FSlateRenderTransform>(FSlateRenderTransform(FQuat2f(FMath::DegreesToRadians(M->GpsAngle)))); })
					]
				]
				+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center)
				[
					SNew(SVerticalBox)
					+ SVerticalBox::Slot().AutoHeight()
					[ SNew(STextBlock).Font(MenuFont("Bold", 18)).ColorAndOpacity(FSlateColor(FLinearColor::White)).Text(Text(&FSCHudModel::GpsMain)) ]
					+ SVerticalBox::Slot().AutoHeight()
					[ SNew(STextBlock).Font(MenuFont("Regular", 12)).ColorAndOpacity(FSlateColor(MenuMuted)).Text(Text(&FSCHudModel::GpsSub)) ]
				]
			]
		]
		// boarding bar (lower centre)
		+ SOverlay::Slot().HAlign(HAlign_Center).VAlign(VAlign_Bottom).Padding(FMargin(0.f, 0.f, 0.f, 230.f))
		[
			SNew(SBorder).BorderImage(HudPanelBrush()).Padding(FMargin(18.f, 10.f))
			.Visibility(ShownIf([M]() { return M->bBoard; }))
			[
				SNew(SVerticalBox)
				+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Center).Padding(0.f, 0.f, 0.f, 6.f)
				[ SNew(STextBlock).Font(MenuFont("Bold", 15)).ColorAndOpacity(FSlateColor(FLinearColor::White)).Text(Text(&FSCHudModel::BoardText)) ]
				+ SVerticalBox::Slot().AutoHeight()
				[
					SNew(SBox).WidthOverride(260.f).HeightOverride(6.f)
					[
						SNew(SOverlay)
						+ SOverlay::Slot()[ SNew(SBorder).BorderImage(BarBrush(false)) ]
						+ SOverlay::Slot().HAlign(HAlign_Left)
						[
							SNew(SBox).WidthOverride_Lambda([M]() { return FOptionalSize(260.f * FMath::Clamp(M->BoardProgress, 0.f, 1.f)); })
							[ SNew(SBorder).BorderImage(BarBrush(true)) ]
						]
					]
				]
			]
		]
		// toasts (top-centre, under the GPS banner)
		+ SOverlay::Slot().HAlign(HAlign_Center).VAlign(VAlign_Top).Padding(FMargin(0.f, 128.f, 0.f, 0.f))
		[ ToastBox ]
		// story card (bottom-centre, above the car)
		+ SOverlay::Slot().HAlign(HAlign_Center).VAlign(VAlign_Bottom).Padding(FMargin(0.f, 0.f, 0.f, 150.f))
		[
			SNew(SBox).MaxDesiredWidth(720.f)
			.Visibility(ShownIf([M]() { return !M->Story.IsEmpty(); }))
			[
				SNew(SBorder).BorderImage(HudPanelBrush()).Padding(FMargin(22.f, 14.f))
				[
					SNew(STextBlock).Font(MenuFont("Regular", 17)).AutoWrapText(true).Justification(ETextJustify::Center)
					.ColorAndOpacity(FSlateColor(FLinearColor::White)).Text(Text(&FSCHudModel::Story))
				]
			]
		]
		];
}
