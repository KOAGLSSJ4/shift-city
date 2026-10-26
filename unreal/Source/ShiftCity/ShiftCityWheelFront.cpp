// Copyright Epic Games, Inc. All Rights Reserved.

#include "ShiftCityWheelFront.h"
#include "UObject/ConstructorHelpers.h"

UShiftCityWheelFront::UShiftCityWheelFront()
{
	AxleType = EAxleType::Front;
	bAffectedBySteering = true;
	MaxSteerAngle = 40.f;
}