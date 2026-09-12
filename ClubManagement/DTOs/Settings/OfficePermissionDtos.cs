namespace ClubManagement.DTOs.Settings;

public class OfficePermissionMatrixDto
{
    public IReadOnlyList<string> RoleCodes { get; set; } = [];
    public IReadOnlyList<OfficeModulePermissionDto> Modules { get; set; } = [];
}

public class OfficeModulePermissionDto
{
    public string ModuleId { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    /// <summary>Role code → view/write flags.</summary>
    public Dictionary<string, OfficeAccessDto> Access { get; set; } = new(StringComparer.OrdinalIgnoreCase);
}

public class OfficeAccessDto
{
    public bool View { get; set; }
    public bool Write { get; set; }
}

public class SaveOfficePermissionMatrixRequest
{
    public List<OfficeModulePermissionDto> Modules { get; set; } = [];
}
