import Foundation
import CDocumentIntelligenceEngine

/// Strongly-typed export formats supported by the engine.
public enum ExportFormat: String, Sendable {
    case yamlFrontmatterV3 = "yaml_frontmatter_v3"
    case takeMockCbtJson = "takemock_cbt_json"
}

/// Asynchronous progress event emitted during page ingestion.
public struct EngineProgressEvent: Sendable, CustomStringConvertible {
    public let eventType: String
    public let currentPage: Int
    public let totalPages: Int
    public let payloadJson: String

    public var description: String {
        "[\(eventType)] Page \(currentPage)/\(totalPages): \(payloadJson)"
    }
}

/// Strongly-typed errors emitted by the Document Intelligence Engine.
public enum EngineError: LocalizedError, Sendable {
    case initializationFailed
    case ingestionFailed(page: Int)
    case exportFailed(format: String)
    case invalidSessionString
    case invalidImageData

    public var errorDescription: String? {
        switch self {
        case .initializationFailed:
            return "Failed to initialize the native Document Intelligence Engine instance."
        case .ingestionFailed(let page):
            return "Optical triage or neural layout processing failed for page \(page)."
        case .exportFailed(let format):
            return "Pass 2 relational export failed for format: \(format)."
        case .invalidSessionString:
            return "Provided session or section identifier contains invalid characters."
        case .invalidImageData:
            return "Image buffer is empty or corrupted."
        }
    }
}

/// Swift wrapper for the on-device Document Intelligence Engine.
///
/// Provides non-blocking async page ingestion and progress streaming
/// designed for macOS SwiftUI applications.
@MainActor
public final class DocumentIntelligenceEngine: ObservableObject {
    private var handle: OpaquePointer?

    @Published public private(set) var isProcessing: Bool = false
    @Published public private(set) var lastEvent: EngineProgressEvent?

    /// Initialize a new Document Intelligence Engine instance.
    ///
    /// - Parameters:
    ///   - modelsDirectory: Optional file URL pointing to on-device neural model weights.
    ///   - configJson: Optional JSON configuration string for hardware tuning.
    public init(modelsDirectory: URL? = nil, configJson: String? = nil) throws {
        let modelsDirCStr = modelsDirectory?.path.cString(using: .utf8)
        let configCStr = configJson?.cString(using: .utf8)

        let h = modelsDirCStr.withOptionalCString { mPtr in
            configCStr.withOptionalCString { cPtr in
                die_engine_init(mPtr, cPtr)
            }
        }

        guard let validHandle = h else {
            throw EngineError.initializationFailed
        }
        self.handle = validHandle
    }

    deinit {
        if let h = handle {
            die_engine_destroy(h)
        }
    }

    /// Ingest a textbook assessment page capture with live async progress streaming.
    ///
    /// - Parameters:
    ///   - sessionId: Unique identifier for the current examination session.
    ///   - sectionId: Subject/Booklet scope identifier (e.g. "Physics_SetA").
    ///   - pageNum: 1-indexed page sequence number.
    ///   - imageData: Raw PNG or JPEG image byte buffer.
    ///   - onProgress: Optional callback closure invoked for progress events.
    /// - Returns: Total number of question entities extracted from the page.
    @discardableResult
    public func ingestPage(
        sessionId: String,
        sectionId: String,
        pageNum: Int,
        imageData: Data,
        onProgress: (@Sendable (EngineProgressEvent) -> Void)? = nil
    ) async throws -> Int {
        guard let h = handle else { throw EngineError.initializationFailed }
        guard !imageData.isEmpty else { throw EngineError.invalidImageData }

        self.isProcessing = true
        defer { self.isProcessing = false }

        return try await withCheckedThrowingContinuation { continuation in
            DispatchQueue.global(qos: .userInitiated).async { [sessionId, sectionId, pageNum, imageData] in
                var progressHandler = onProgress

                let callback: DIEProgressCallback = { eventType, cur, total, payload, userData in
                    guard let eventType = eventType, let payload = payload else { return }
                    let event = EngineProgressEvent(
                        eventType: String(cString: eventType),
                        currentPage: Int(cur),
                        totalPages: Int(total),
                        payloadJson: String(cString: payload)
                    )

                    if let ptr = userData {
                        let handler = Unmanaged<AnyObject>.fromOpaque(ptr).takeUnretainedValue()
                        if let cb = handler as? (@Sendable (EngineProgressEvent) -> Void) {
                            cb(event)
                        }
                    }
                }

                let handlerBox: AnyObject? = progressHandler.map { $0 as AnyObject }
                let userData = handlerBox.map { Unmanaged.passUnretained($0).toOpaque() }

                let result = imageData.withUnsafeBytes { rawBuffer in
                    guard let baseAddress = rawBuffer.baseAddress?.assumingMemoryBound(to: UInt8.self) else {
                        return Int32(-1)
                    }

                    return die_session_ingest_page(
                        h,
                        sessionId,
                        sectionId,
                        Int32(pageNum),
                        baseAddress,
                        rawBuffer.count,
                        callback,
                        userData
                    )
                }

                if result >= 0 {
                    continuation.resume(returning: Int(result))
                } else {
                    continuation.resume(throwing: EngineError.ingestionFailed(page: pageNum))
                }
            }
        }
    }

    /// Reconcile questions across the session and export into the specified format.
    ///
    /// - Parameters:
    ///   - sessionId: Examination session to export.
    ///   - format: Target serialization schema (.yamlFrontmatterV3 or .takeMockCbtJson).
    /// - Returns: Serialized document output string.
    public func exportSession(
        sessionId: String,
        format: ExportFormat = .yamlFrontmatterV3
    ) throws -> String {
        guard let h = handle else { throw EngineError.initializationFailed }

        guard let cOutput = die_session_export(h, sessionId, format.rawValue) else {
            throw EngineError.exportFailed(format: format.rawValue)
        }
        defer { die_string_free(cOutput) }

        return String(cString: cOutput)
    }
}

private extension Optional where Wrapped == [CChar] {
    func withOptionalCString<R>(_ body: (UnsafePointer<CChar>?) throws -> R) rethrows -> R {
        if let self = self {
            return try self.withUnsafeBufferPointer { buffer in
                try body(buffer.baseAddress)
            }
        } else {
            return try body(nil)
        }
    }
}
