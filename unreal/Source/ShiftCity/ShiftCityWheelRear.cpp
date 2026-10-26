// Copyright Epic Games, Inc. All Rights Reserved.

#include "ShiftCityWheelRear.h"
#include "UObject/ConstructorHelpers.h"

UShiftCityWheelRear::UShiftCityWheelRear()
{
	AxleType = EAxleType::Rear;
	bAffectedByHandbrake = true;
	bAffectedByEngine = true;
}