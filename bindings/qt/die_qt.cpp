#include "die_qt.hpp"
#include <QtConcurrent/QtConcurrent>
#include <QJsonDocument>
#include <QJsonObject>

namespace takemock {

DocumentIntelligenceEngineQt::DocumentIntelligenceEngineQt(
    const QString& modelsDirectory,
    const QString& configJson,
    QObject* parent
) : QObject(parent) {
    QByteArray modelsBytes = modelsDirectory.toUtf8();
    QByteArray configBytes = configJson.toUtf8();

    const char* mPtr = modelsDirectory.isEmpty() ? nullptr : modelsBytes.constData();
    const char* cPtr = configJson.isEmpty() ? nullptr : configBytes.constData();

    m_handle = die_engine_init(mPtr, cPtr);
}

DocumentIntelligenceEngineQt::~DocumentIntelligenceEngineQt() {
    if (m_handle) {
        die_engine_destroy(m_handle);
        m_handle = nullptr;
    }
}

bool DocumentIntelligenceEngineQt::isValid() const noexcept {
    return m_handle != nullptr;
}

void DocumentIntelligenceEngineQt::cProgressCallback(
    const char* event_type,
    int32_t current_page,
    int32_t total_pages,
    const char* payload_json,
    void* user_data
) {
    if (!user_data) return;
    auto* self = static_cast<DocumentIntelligenceEngineQt*>(user_data);

    QString eventStr = QString::fromUtf8(event_type ? event_type : "");
    QString payloadStr = QString::fromUtf8(payload_json ? payload_json : "{}");

    emit self->progressOccurred(eventStr, current_page, total_pages, payloadStr);
}

QFuture<int> DocumentIntelligenceEngineQt::ingestPageAsync(
    const QString& sessionId,
    const QString& sectionId,
    int pageNum,
    const QByteArray& imageData
) {
    return QtConcurrent::run([this, sessionId, sectionId, pageNum, imageData]() -> int {
        if (!m_handle) {
            emit ingestionFailed(sessionId, pageNum, "Engine handle is null or uninitialized");
            return -1;
        }

        QByteArray sessBytes = sessionId.toUtf8();
        QByteArray secBytes = sectionId.toUtf8();

        int result = die_session_ingest_page(
            m_handle,
            sessBytes.constData(),
            secBytes.constData(),
            pageNum,
            reinterpret_cast<const uint8_t*>(imageData.constData()),
            static_cast<uintptr_t>(imageData.size()),
            &DocumentIntelligenceEngineQt::cProgressCallback,
            this
        );

        if (result >= 0) {
            emit pageIngestionFinished(sessionId, pageNum, result);
        } else {
            emit ingestionFailed(sessionId, pageNum, "Pass 1 optical or neural analysis failed");
        }

        return result;
    });
}

QString DocumentIntelligenceEngineQt::exportSession(
    const QString& sessionId,
    ExportFormat format
) {
    if (!m_handle) return QString();

    const char* targetFormat = (format == ExportFormat::TakeMockCbtJson)
        ? "takemock_cbt_json"
        : "yaml_frontmatter_v3";

    QByteArray sessBytes = sessionId.toUtf8();
    char* rawStr = die_session_export(m_handle, sessBytes.constData(), targetFormat);
    if (!rawStr) {
        return QString();
    }

    DIEUniqueString managedStr(rawStr);
    return QString::fromUtf8(managedStr.get());
}

} // namespace takemock
