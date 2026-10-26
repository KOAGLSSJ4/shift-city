using UnrealBuildTool;

public class ShiftCityCore : ModuleRules
{
	public ShiftCityCore(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
		PublicDependencyModuleNames.AddRange(new string[] { "Core", "CoreUObject", "Engine", "InputCore" });
		PrivateDependencyModuleNames.AddRange(new string[] { "Json", "JsonUtilities", "Projects", "SlateCore" });
	}
}
