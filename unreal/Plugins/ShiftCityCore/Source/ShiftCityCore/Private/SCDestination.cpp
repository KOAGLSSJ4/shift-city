#include "SCDestination.h"
#include "Components/StaticMeshComponent.h"
#include "Components/TextRenderComponent.h"
#include "Engine/StaticMesh.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "UObject/ConstructorHelpers.h"

ASCDestination::ASCDestination()
{
	PrimaryActorTick.bCanEverTick = false;
	Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	RootComponent = Root;

	static ConstructorHelpers::FObjectFinder<UStaticMesh> Cyl(TEXT("/Engine/BasicShapes/Cylinder.Cylinder"));
	Beam = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Beam"));
	Ring = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Ring"));
	for (UStaticMeshComponent* C : { Beam.Get(), Ring.Get() })
	{
		C->SetupAttachment(Root);
		if (Cyl.Succeeded()) C->SetStaticMesh(Cyl.Object);
		C->SetCollisionEnabled(ECollisionEnabled::NoCollision);
		C->SetCastShadow(false);
	}
	Beam->SetRelativeScale3D(FVector(1.2f, 1.2f, 40.f)); // 1 m cylinder -> 40 m light column
	Beam->SetRelativeLocation(FVector(0, 0, 2000.f));

	Label = CreateDefaultSubobject<UTextRenderComponent>(TEXT("Label"));
	Label->SetupAttachment(Root);
	Label->SetRelativeLocation(FVector(0, 0, 400.f));
	Label->SetHorizontalAlignment(EHTA_Center);
	Label->SetWorldSize(120.f);
	Label->SetHiddenInGame(true); // editor-only helper so you can see which place is which
}

void ASCDestination::OnConstruction(const FTransform& Transform)
{
	Super::OnConstruction(Transform);
	const float D = Radius * 2.f / 100.f;
	Ring->SetRelativeScale3D(FVector(D, D, 0.02f));
	Ring->SetRelativeLocation(FVector(0, 0, 2.f));
	Label->SetText(FText::FromString(DisplayName));
}

void ASCDestination::BeginPlay()
{
	Super::BeginPlay();
	if (UMaterialInterface* Base = Beam->GetMaterial(0))
	{
		Mat = UMaterialInstanceDynamic::Create(Base, this);
		Beam->SetMaterial(0, Mat);
		Ring->SetMaterial(0, Mat);
	}
	SetMarker(false, FLinearColor::White);
}

void ASCDestination::SetMarker(bool bShow, const FLinearColor& Color)
{
	Beam->SetVisibility(bShow);
	Ring->SetVisibility(bShow);
	// BasicShapeMaterial exposes a "Color" parameter
	if (Mat) Mat->SetVectorParameterValue(TEXT("Color"), Color);
}
