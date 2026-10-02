// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "DocumentIntelligenceEngine",
    platforms: [
        .macOS(.v13),
        .iOS(.v16)
    ],
    products: [
        .library(
            name: "DocumentIntelligenceEngine",
            targets: ["DocumentIntelligenceEngine"]
        ),
    ],
    targets: [
        .systemLibrary(
            name: "CDocumentIntelligenceEngine",
            path: "Sources/CDocumentIntelligenceEngine"
        ),
        .target(
            name: "DocumentIntelligenceEngine",
            dependencies: ["CDocumentIntelligenceEngine"],
            path: "Sources/DocumentIntelligenceEngine"
        ),
    ]
)
