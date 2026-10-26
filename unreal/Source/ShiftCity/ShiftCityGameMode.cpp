// Copyright Epic Games, Inc. All Rights Reserved.

#include "ShiftCityGameMode.h"
#include "ShiftCityPlayerController.h"

AShiftCityGameMode::AShiftCityGameMode()
{
	PlayerControllerClass = AShiftCityPlayerController::StaticClass();
}
