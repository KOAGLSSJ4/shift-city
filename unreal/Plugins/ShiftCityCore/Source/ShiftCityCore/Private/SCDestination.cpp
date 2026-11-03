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
	Ring->SetRelativeScale3D(FVector(D, D, 0.01f)); // 1 cm thin
	Ring->SetRelativeLocation(FVector(0, 0, 3.f));
	Label->SetText(FText::FromString(DisplayName));
}

void ASCDestination::BeginPlay()
{
	Super::BeginPlay();
	// a glowing disc on the road marks the spot (the HUD's floating arrow shows it from afar); the old grey light
	// column read as a pillar standing in the street, so it stays hidden
	UMaterialInterface* Base = LoadObject<UMaterialInterface>(nullptr, TEXT("/Game/ShiftCity/Materials/M_CarSurface.M_CarSurface"));
	if (!Base) Base = Ring->GetMaterial(0);
	if (Base)
	{
		Mat = UMaterialInstanceDynamic::Create(Base, this);
		Ring->SetMaterial(0, Mat);
	}
	SetMarker(false, FLinearColor::White);
}

void ASCDestination::SetMarker(bool bShow, const FLinearColor& Color)
{
	Beam->SetVisibility(false);
	Ring->SetVisibility(bShow);
	// both our car paint and BasicShapeMaterial have a "Color" parameter; ours also glows
	if (Mat)
	{
		Mat->SetVectorParameterValue(TEXT("Color"), Color);
		Mat->SetVectorParameterValue(TEXT("Emissive"), Color * 4.f);
		Mat->SetScalarParameterValue(TEXT("Roughness"), 0.6f);
	}
}
