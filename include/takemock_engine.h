#ifndef TAKEMOCK_ENGINE_H
#define TAKEMOCK_ENGINE_H

#ifdef __cplusplus
extern "C" {
#endif

#include <stdint.h>
#include <stddef.h>

typedef struct takemock_engine takemock_engine_t;

takemock_engine_t* takemock_engine_create(
    const char* db_path,
    const char* models_dir,
    const char* cache_dir
);

void takemock_engine_destroy(takemock_engine_t* engine);

int takemock_engine_submit_job(
    takemock_engine_t* engine,
    const char** image_paths,
    uint32_t count,
    char* out_job_id,
    size_t out_len
);

int takemock_engine_submit_memory_job(
    takemock_engine_t* engine,
    const uint8_t** buffers,
    const size_t* lengths,
    uint32_t count,
    char* out_job_id,
    size_t out_len
);

float takemock_engine_get_progress(takemock_engine_t* engine, const char* job_id);

int takemock_engine_get_results_json(
    takemock_engine_t* engine,
    const char* job_id,
    char* out_buf,
    size_t max_len
);

int takemock_engine_cancel_job(takemock_engine_t* engine, const char* job_id);

#ifdef __cplusplus
}
#endif

#endif // TAKEMOCK_ENGINE_H
