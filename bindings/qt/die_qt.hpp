#pragma once

#include <QObject>
#include <QString>
#include <QByteArray>
#include <QJsonObject>
#include <QFuture>
#include <memory>

extern "C" {
#include "document_intelligence_engine.h"
}

namespace takemock {

/// Custom deleter for C strings allocated by die_session_export.
struct DIEStringDeleter {
    void operator()(char* ptr) const noexcept {
        if (ptr) {
            die_string_free(ptr);
        }
    }
};

using DIEUniqueString = std::unique_ptr<char, DIEStringDeleter>;

/// Supported Pass 2 export schemas.
enum class ExportFormat {
    YamlFrontmatterV3,
    TakeMockCbtJson
};

/**
 * @brief Qt6 C++ QObject wrapper for the Document Intelligence Engine.
 * Designed for Linux/Cross-platform desktop applications.
 */
class DocumentIntelligenceEngineQt : public QObject {
    Q_OBJECT

public:
    explicit DocumentIntelligenceEngineQt(
        const QString& modelsDirectory = QString(),
        const QString& configJson = QString(),
        QObject* parent = nullptr
    );
    ~DocumentIntelligenceEngineQt() override;

    bool isValid() const noexcept;

    /**
     * @brief Ingest a page asynchronously, emitting Qt progress signals.
     */
    QFuture<int> ingestPageAsync(
        const QString& sessionId,
        const QString& sectionId,
        int pageNum,
        const QByteArray& imageData
    );

    /**
     * @brief Export questions across the session.
     */
    QString exportSession(
        const QString& sessionId,
        ExportFormat format = ExportFormat::YamlFrontmatterV3
    );

signals:
    void progressOccurred(
        const QString& eventType,
        int currentPage,
        int totalPages,
        const QString& payloadJson
    );

    void pageIngestionFinished(
        const QString& sessionId,
        int pageNum,
        int questionCount
    );

    void ingestionFailed(
        const QString& sessionId,
        int pageNum,
        const QString& errorMessage
    );

private:
    DIEEngineHandle* m_handle = nullptr;

    static void cProgressCallback(
        const char* event_type,
        int32_t current_page,
        int32_t total_pages,
        const char* payload_json,
        void* user_data
    );
};

} // namespace takemock
