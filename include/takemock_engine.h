#ifndef TAKEMOCK_ENGINE_H
#define TAKEMOCK_ENGINE_H

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct EngineContext EngineContext;

typedef enum {
    MODE_1_DECOUPLED = 1,
    MODE_2_INTEGRATED = 2
} IngestionMode;

typedef enum {
    PROFILE_ECO = 1,      // <8 GB RAM: Heuristic + Tesseract
    PROFILE_STANDARD = 2, // 16 GB RAM: Qwen2-VL-2B / 3B + Metal/DirectML
    PROFILE_PRO = 3       // 32 GB+ RAM: High precision VLM
} HardwareProfile;

typedef struct {
    int32_t progress_percentage; // 0 - 100
    uint32_t current_page;
    uint32_t total_pages;
    const char* current_stage;   // e.g. "GEOMETRIC_DEWARP", "VLM_REASONING"
    const char* error_message;   // NULL if no error
} EngineProgress;

typedef struct {
    const uint8_t* bytes;
    size_t byte_count;
    const char* filename_hint;   // e.g. "page_01.jpg"
} MemoryBuffer;

typedef void (*EngineProgressCallback)(const EngineProgress* progress, void* user_data);

// Initialize engine context with automatic hardware profile detection
EngineContext* takemock_engine_init(const char* storage_dir, HardwareProfile profile);

// Submit an asynchronous reconstruction job from file paths
uint64_t takemock_engine_submit_job(
    EngineContext* ctx,
    IngestionMode mode,
    const char** question_image_paths, uint32_t num_questions,
    const char** answer_image_paths, uint32_t num_answers,
    const char** solution_image_paths, uint32_t num_solutions,
    EngineProgressCallback callback, void* user_data
);

// Submit an asynchronous reconstruction job from in-memory byte buffers (zero-disk FFI)
uint64_t takemock_engine_submit_memory_job(
    EngineContext* ctx,
    IngestionMode mode,
    const MemoryBuffer* question_buffers, uint32_t num_questions,
    const MemoryBuffer* answer_buffers, uint32_t num_answers,
    const MemoryBuffer* solution_buffers, uint32_t num_solutions,
    EngineProgressCallback callback, void* user_data
);

// Cancel an ongoing job gracefully
bool takemock_engine_cancel_job(EngineContext* ctx, uint64_t job_id);

// Retrieve local file path of a cropped visual asset for native UI display
const char* takemock_engine_get_asset_path(EngineContext* ctx, const char* asset_id);

// Retrieve canonical JSON result (caller must free returned string via takemock_engine_free_string)
char* takemock_engine_get_result_json(EngineContext* ctx, uint64_t job_id);

// Free allocated JSON string
void takemock_engine_free_string(char* ptr);

// Destroy engine context and unload models from memory
void takemock_engine_destroy(EngineContext* ctx);

#ifdef __cplusplus
}
#endif

#endif // TAKEMOCK_ENGINE_H
