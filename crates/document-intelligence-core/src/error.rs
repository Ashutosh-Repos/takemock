//! Strongly typed error hierarchy for the Document Intelligence Engine.

use thiserror::Error;

/// Result alias for operations returning [`DIEError`].
pub type Result<T, E = DIEError> = std::result::Result<T, E>;

/// Master error enumeration for document intelligence pipeline stages.
#[derive(Debug, Error)]
pub enum DIEError {
    /// Focus variance falls below acceptable threshold ($\sigma_L^2 < 80.0$).
    #[error("image is unrecoverably blurred (laplacian variance: {variance:.2} < {threshold:.2})")]
    UnrecoverableBlur {
        /// Computed Laplacian focus variance.
        variance: f64,
        /// Minimum required variance threshold.
        threshold: f64,
    },

    /// Image fails Gabor text frequency distribution criteria.
    #[error("non-academic image rejected by optical triage (gabor ratio: {gabor_ratio:.2}, edge density: {edge_density:.4})")]
    NonAcademicImage {
        /// Computed directional Gabor energy ratio.
        gabor_ratio: f64,
        /// Computed edge pixel density.
        edge_density: f64,
    },

    /// Image exhibits monospace receipts, code editors, or terminal logs.
    #[error("non-academic layout rejected (line spacing variance: {variance:.2}, aspect ratio: {aspect_ratio:.2})")]
    NonAcademicLayout {
        /// Vertical line spacing variance.
        variance: f64,
        /// Bounding aspect ratio.
        aspect_ratio: f64,
    },

    /// Paper fold, crease, or tear physically obscures critical assessment content.
    #[error("severe manifold discontinuity detected at coordinate ({x}, {y}) with gradient {gradient:.2}")]
    CreaseOcclusion {
        /// X-coordinate of detected tear/crease.
        x: u32,
        /// Y-coordinate of detected tear/crease.
        y: u32,
        /// Measured displacement gradient magnitude $\|\nabla F\|_2$.
        gradient: f64,
    },

    /// Operating system free memory falls below safe operating threshold.
    #[error("host memory pressure warning: available memory {available_mb} MB is below required safety threshold {required_mb} MB")]
    WarnLowMemory {
        /// Available system RAM in megabytes.
        available_mb: u64,
        /// Minimum required safety headroom in megabytes.
        required_mb: u64,
    },

    /// Windows DirectML kernel execution duration exceeded safe timeout threshold.
    #[error("directml GPU fence timeout protection triggered (duration: {duration_ms} ms >= 250 ms)")]
    TdrTimeoutWarning {
        /// Execution duration in milliseconds.
        duration_ms: u64,
    },

    /// Grammar logit mask evaluated to zero valid transition candidates.
    #[error("grammar deadlock recovered via raw byte fallback (token index: {token_idx}, rule: {rule})")]
    GrammarDeadlockRecovered {
        /// Token sequence index where zero-bitmask occurred.
        token_idx: usize,
        /// Current grammar state or rule name.
        rule: String,
    },

    /// Relational session database error.
    #[error("session database error: {0}")]
    DatabaseError(#[from] rusqlite::Error),

    /// Image decoding or pixel manipulation error.
    #[error("image decoding error: {0}")]
    ImageError(#[from] image::ImageError),

    /// JSON serialization/deserialization failure.
    #[error("json serialization error: {0}")]
    JsonError(#[from] serde_json::Error),

    /// YAML serialization/deserialization failure.
    #[error("yaml serialization error: {0}")]
    YamlError(#[from] serde_yaml::Error),

    /// Input/output error.
    #[error("io error: {0}")]
    IoError(#[from] std::io::Error),

    /// Core engine state machine or IO error.
    #[error("engine execution error: {0}")]
    ExecutionError(String),
}
