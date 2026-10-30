using UnrealBuildTool;

public class ShiftCityCore : ModuleRules
{
	public ShiftCityCore(ReadOnlyTargetRules Target) : base(Target)
	{
		// Source files: SCMenu.cpp (Slate menus) added 2026-10-29, SCCarVisuals.cpp (garage cars) 2026-10-30; editing this file makes UBT rescan for new .cpp files
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
		PublicDependencyModuleNames.AddRange(new string[] { "Core", "CoreUObject", "Engine", "InputCore", "ProceduralMeshComponent", "ChaosVehicles", "ChaosVehiclesCore", "PhysicsCore" });
		PrivateDependencyModuleNames.AddRange(new string[] { "AssetRegistry", "Json", "JsonUtilities", "Projects", "RenderCore", "SlateCore", "Slate", "UMG" });
	}
}
