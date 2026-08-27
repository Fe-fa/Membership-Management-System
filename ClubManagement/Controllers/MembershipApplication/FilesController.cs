using ClubManagement.Data.MembershipApplication;
using ClubManagement.Entities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ClubManagement.Controllers.MembershipApplication;

/// <summary>
/// Multipart file uploads for the React wizard:
///   POST /api/applications/documents   (multipart/form-data: file, purpose)
/// The wizard expects a FileRef { id, fileName, size, contentType, url } back.
/// Files are stored under wwwroot/uploads and exposed via UseStaticFiles.
/// </summary>
[ApiController]
[Route("api/applications")]
public class FilesController : ControllerBase
{
    private readonly IWebHostEnvironment _environment;

    private static readonly HashSet<string> AllowedPurposes = new(StringComparer.OrdinalIgnoreCase)
    {
        "photo", "cv", "license", "idPassport"
    };

    private static readonly HashSet<string> AllowedContentTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "application/pdf",
        "image/png", "image/jpeg", "image/webp",
        "image/gif", "image/bmp", "image/tiff",
        // Word documents — the wizard's CV field accepts .doc / .docx
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/octet-stream"
    };

    private const long MaxFileSizeBytes = 10 * 1024 * 1024; // 10 MB

    public FilesController(IWebHostEnvironment environment)
    {
        _environment = environment;
    }

    [HttpPost("documents")]
    [RequestSizeLimit(MaxFileSizeBytes)]
    public async Task<ActionResult<FileRefDto>> Upload(
        [FromForm] IFormFile file,
        [FromForm] string purpose,
        CancellationToken cancellationToken)
    {
        if (file is null || file.Length == 0)
        {
            return BadRequest(new { message = "No file was uploaded." });
        }

        if (string.IsNullOrWhiteSpace(purpose) || !AllowedPurposes.Contains(purpose))
        {
            return BadRequest(new { message = $"Unsupported purpose '{purpose}'. Use one of: {string.Join(", ", AllowedPurposes)}." });
        }

        var contentType = file.ContentType;
        if (string.Equals(contentType, "application/octet-stream", StringComparison.OrdinalIgnoreCase))
        {
            // Browsers sometimes label .docx as octet-stream — accept it when
            // the extension is a known document type.
            var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
            if (ext is ".doc" or ".docx" or ".pdf" or ".png" or ".jpg" or ".jpeg" or ".webp")
            {
                contentType = ext switch
                {
                    ".doc" => "application/msword",
                    ".docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    ".pdf" => "application/pdf",
                    ".png" => "image/png",
                    ".jpg" or ".jpeg" => "image/jpeg",
                    ".webp" => "image/webp",
                    _ => contentType
                };
            }
        }

        if (!AllowedContentTypes.Contains(contentType))
        {
            return BadRequest(new { message = $"Unsupported file type '{contentType}'." });
        }

        var webRoot = _environment.WebRootPath ?? Path.Combine(_environment.ContentRootPath, "wwwroot");
        var uploadsDir = Path.Combine(webRoot, "uploads");
        Directory.CreateDirectory(uploadsDir);

        var extension = Path.GetExtension(file.FileName);
        if (string.IsNullOrWhiteSpace(extension))
        {
            extension = ExtensionFor(contentType);
        }

        var storedName = $"{purpose}-{Guid.NewGuid():N}{extension}";
        var fullPath = Path.Combine(uploadsDir, storedName);

        await using (var stream = System.IO.File.Create(fullPath))
        {
            await file.CopyToAsync(stream, cancellationToken);
        }

        // Make the URL absolute so the wizard can use it verbatim as FileRef.url
        // and the profile photo_url column can store it for retrieval.
        var request = HttpContext.Request;
        var scheme = request.Scheme;
        var host = request.Host.Value;
        var url = $"{scheme}://{host}/uploads/{storedName}";

        return Ok(new FileRefDto
        {
            Id = storedName,
            FileName = file.FileName,
            Size = file.Length,
            ContentType = contentType,
            Url = url,
        });
    }

    private static string ExtensionFor(string contentType) => contentType.ToLowerInvariant() switch
    {
        "application/pdf" => ".pdf",
        "image/png" => ".png",
        "image/webp" => ".webp",
        "image/gif" => ".gif",
        "image/bmp" => ".bmp",
        "image/tiff" => ".tiff",
        "application/msword" => ".doc",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" => ".docx",
        _ => ".jpg",
    };
}

/// <summary>Matches the FileRef shape the React client consumes.</summary>
public class FileRefDto
{
    public string Id { get; set; } = string.Empty;
    public string FileName { get; set; } = string.Empty;
    public long Size { get; set; }
    public string ContentType { get; set; } = string.Empty;
    public string? Url { get; set; }
}
