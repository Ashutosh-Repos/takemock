using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace TakeMock.DocumentIntelligenceEngine;

/// <summary>
/// Progress event emitted during optical triage and neural analysis.
/// </summary>
public record EngineProgressEvent(
    string EventType,
    int CurrentPage,
    int TotalPages,
    string PayloadJson
);

/// <summary>
/// Supported Pass 2 export formats.
/// </summary>
public enum ExportFormat
{
    YamlFrontmatterV3,
    TakeMockCbtJson,
}

internal static class NativeMethods
{
    private const string DllName = "document_intelligence_engine";

    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    public delegate void DIEProgressCallback(
        [MarshalAs(UnmanagedType.LPUTF8Str)] string eventType,
        int currentPage,
        int totalPages,
        [MarshalAs(UnmanagedType.LPUTF8Str)] string payloadJson,
        IntPtr userData
    );

    [DllImport(DllName, CallingConvention = CallingConvention.Cdecl)]
    public static extern SafeEngineHandle die_engine_init(
        [MarshalAs(UnmanagedType.LPUTF8Str)] string? modelsDir,
        [MarshalAs(UnmanagedType.LPUTF8Str)] string? configJson
    );

    [DllImport(DllName, CallingConvention = CallingConvention.Cdecl)]
    public static extern void die_engine_destroy(IntPtr handle);

    [DllImport(DllName, CallingConvention = CallingConvention.Cdecl)]
    public static extern int die_session_ingest_page(
        SafeEngineHandle handle,
        [MarshalAs(UnmanagedType.LPUTF8Str)] string sessionId,
        [MarshalAs(UnmanagedType.LPUTF8Str)] string sectionId,
        int pageNum,
        byte[] imageBytes,
        nuint imageLen,
        DIEProgressCallback? callback,
        IntPtr userData
    );

    [DllImport(DllName, CallingConvention = CallingConvention.Cdecl)]
    public static extern IntPtr die_session_export(
        SafeEngineHandle handle,
        [MarshalAs(UnmanagedType.LPUTF8Str)] string sessionId,
        [MarshalAs(UnmanagedType.LPUTF8Str)] string targetFormat
    );

    [DllImport(DllName, CallingConvention = CallingConvention.Cdecl)]
    public static extern void die_string_free(IntPtr ptr);
}

/// <summary>
/// SafeHandle wrapping the native DIEEngineHandle pointer.
/// </summary>
public sealed class SafeEngineHandle : SafeHandle
{
    public SafeEngineHandle() : base(IntPtr.Zero, true) { }

    public override bool IsInvalid => handle == IntPtr.Zero;

    protected override bool ReleaseHandle()
    {
        NativeMethods.die_engine_destroy(handle);
        return true;
    }
}

/// <summary>
/// Managed wrapper for the on-device Document Intelligence Engine.
/// Designed for Windows desktop applications (WinUI 3 / WPF / .NET 8).
/// </summary>
public sealed class DocumentIntelligenceEngine : IDisposable
{
    private readonly SafeEngineHandle _handle;
    private bool _disposed;

    /// <summary>
    /// Initializes a new instance of the Document Intelligence Engine.
    /// </summary>
    /// <param name="modelsDirectory">Optional directory containing on-device neural weights.</param>
    /// <param name="configJson">Optional configuration string for hardware tuning.</param>
    public DocumentIntelligenceEngine(string? modelsDirectory = null, string? configJson = null)
    {
        _handle = NativeMethods.die_engine_init(modelsDirectory, configJson);
        if (_handle.IsInvalid)
        {
            throw new InvalidOperationException("Failed to initialize native Document Intelligence Engine.");
        }
    }

    /// <summary>
    /// Ingests a single assessment page capture with asynchronous execution and progress reporting.
    /// </summary>
    public async Task<int> IngestPageAsync(
        string sessionId,
        string sectionId,
        int pageNum,
        byte[] imageBytes,
        IProgress<EngineProgressEvent>? progress = null,
        CancellationToken cancellationToken = default)
    {
        ThrowIfDisposed();
        ArgumentNullException.ThrowIfNull(sessionId);
        ArgumentNullException.ThrowIfNull(sectionId);
        ArgumentNullException.ThrowIfNull(imageBytes);

        if (imageBytes.Length == 0)
        {
            throw new ArgumentException("Image byte buffer cannot be empty.", nameof(imageBytes));
        }

        return await Task.Run(() =>
        {
            cancellationToken.ThrowIfCancellationRequested();

            NativeMethods.DIEProgressCallback? callback = null;
            if (progress != null)
            {
                callback = (eventType, cur, total, payload, _) =>
                {
                    progress.Report(new EngineProgressEvent(eventType, cur, total, payload));
                };
            }

            int count = NativeMethods.die_session_ingest_page(
                _handle,
                sessionId,
                sectionId,
                pageNum,
                imageBytes,
                (nuint)imageBytes.Length,
                callback,
                IntPtr.Zero
            );

            if (count < 0)
            {
                throw new InvalidOperationException($"Optical or neural processing failed on page {pageNum}.");
            }

            return count;
        }, cancellationToken);
    }

    /// <summary>
    /// Exports all questions in the given session into the requested format.
    /// </summary>
    public string ExportSession(string sessionId, ExportFormat format = ExportFormat.YamlFrontmatterV3)
    {
        ThrowIfDisposed();
        ArgumentNullException.ThrowIfNull(sessionId);

        string formatStr = format switch
        {
            ExportFormat.YamlFrontmatterV3 => "yaml_frontmatter_v3",
            ExportFormat.TakeMockCbtJson => "takemock_cbt_json",
            _ => throw new ArgumentOutOfRangeException(nameof(format)),
        };

        IntPtr ptr = NativeMethods.die_session_export(_handle, sessionId, formatStr);
        if (ptr == IntPtr.Zero)
        {
            throw new InvalidOperationException($"Pass 2 export failed for format '{formatStr}'.");
        }

        try
        {
            return Marshal.PtrToStringUTF8(ptr) ?? string.Empty;
        }
        finally
        {
            NativeMethods.die_string_free(ptr);
        }
    }

    private void ThrowIfDisposed()
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
    }

    public void Dispose()
    {
        if (!_disposed)
        {
            _handle.Dispose();
            _disposed = true;
        }
    }
}
