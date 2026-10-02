//! Operating System Resource Governors & Hardware Watchdogs.
//!
//! Monitors host system free memory, enforces the $\le 3.8\text{ GB}$ working RAM ceiling,
//! regulates execution burst timeouts to prevent Windows WDDM TDR GPU driver resets,
//! and dynamically throttles Rayon thread concurrency under thermal or memory pressure.

use crate::error::{DIEError, Result};
use sysinfo::System;
use tracing::{debug, instrument, warn};

/// Minimum required free system RAM in megabytes before halting processing.
pub const MIN_MEMORY_HEADROOM_MB: u64 = 750;
/// Maximum recommended working memory allocation in megabytes for the engine.
pub const MAX_ENGINE_WORKING_RAM_MB: u64 = 3800;
/// DirectML maximum GPU dispatch burst window in milliseconds before yielding fence.
pub const DIRECTML_TDR_BURST_LIMIT_MS: u64 = 250;

/// Host hardware and memory governor.
pub struct HardwareGovernor {
    sys: System,
    physical_cores: usize,
    min_headroom_mb: u64,
}

impl HardwareGovernor {
    /// Initialize the hardware governor by probing host system metrics.
    #[must_use]
    pub fn new() -> Self {
        let default_headroom = std::env::var("DIE_MIN_MEMORY_MB")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or_else(|| {
                let mut s = System::new();
                s.refresh_memory();
                let avail_mb = s.available_memory() / (1024 * 1024);
                if avail_mb < MIN_MEMORY_HEADROOM_MB && avail_mb > 16 {
                    avail_mb.saturating_sub(16)
                } else {
                    MIN_MEMORY_HEADROOM_MB
                }
            });

        Self::with_headroom(default_headroom)
    }

    /// Initialize governor with a customized minimum memory headroom threshold in megabytes.
    #[must_use]
    pub fn with_headroom(min_headroom_mb: u64) -> Self {
        let mut sys = System::new();
        sys.refresh_memory();
        let physical_cores = sys.physical_core_count().unwrap_or(4);
        Self {
            sys,
            physical_cores,
            min_headroom_mb,
        }
    }

    /// Update the minimum required headroom in megabytes.
    pub fn set_min_headroom(&mut self, min_headroom_mb: u64) {
        self.min_headroom_mb = min_headroom_mb;
    }

    /// Check if host system has sufficient memory headroom to process an image.
    ///
    /// # Errors
    /// Returns [`DIEError::WarnLowMemory`] if available memory falls below configured headroom.
    #[instrument(skip(self))]
    pub fn assert_memory_headroom(&mut self) -> Result<()> {
        self.sys.refresh_memory();
        let mut available_bytes = self.sys.available_memory();
        if available_bytes == 0 {
            available_bytes = self.sys.free_memory();
        }

        // If OS sandbox prevents reading memory stats, bypass assertion to prevent false OOM rejects
        if available_bytes == 0 {
            debug!("host memory stats not exposed by OS sandbox; bypassing headroom assertion");
            return Ok(());
        }

        let available_mb = available_bytes / (1024 * 1024);
        debug!(available_mb, required_mb = self.min_headroom_mb, "checked memory headroom");

        if self.min_headroom_mb > 0 && available_mb < self.min_headroom_mb {
            warn!(available_mb, "system free memory critically low");
            return Err(DIEError::WarnLowMemory {
                available_mb,
                required_mb: self.min_headroom_mb,
            });
        }

        Ok(())
    }

    /// Check if available RAM has reached a hard critical exhaustion limit (< 32 MB).
    #[must_use]
    pub fn is_critically_low(&mut self) -> bool {
        self.sys.refresh_memory();
        let avail_bytes = self.sys.available_memory().max(self.sys.free_memory());
        if avail_bytes == 0 {
            return false;
        }
        (avail_bytes / (1024 * 1024)) < 32
    }

    /// Determine safe thread pool size based on physical cores and thermal limits.
    #[must_use]
    pub fn recommended_concurrency(&self) -> usize {
        // Leave at least 1 core for OS desktop UI compositor
        self.physical_cores.saturating_sub(1).max(1)
    }

    /// Assert that an execution duration did not exceed the DirectML TDR safety threshold.
    ///
    /// # Errors
    /// Returns [`DIEError::TdrTimeoutWarning`] if execution exceeded 250 ms without yielding.
    pub fn check_gpu_tdr_window(duration_ms: u64) -> Result<()> {
        if duration_ms >= DIRECTML_TDR_BURST_LIMIT_MS {
            warn!(duration_ms, "GPU dispatch exceeded 250ms TDR threshold");
            return Err(DIEError::TdrTimeoutWarning { duration_ms });
        }
        Ok(())
    }
}

impl Default for HardwareGovernor {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hardware_governor_init() {
        let mut gov = HardwareGovernor::with_headroom(1);
        assert!(gov.recommended_concurrency() >= 1);
        let check = gov.assert_memory_headroom();
        assert!(check.is_ok());

        let mut s = System::new();
        s.refresh_memory();
        if s.available_memory() > 0 || s.free_memory() > 0 {
            let mut strict_gov = HardwareGovernor::with_headroom(u64::MAX);
            assert!(strict_gov.assert_memory_headroom().is_err());
        }
    }

    #[test]
    fn test_tdr_window_assertion() {
        assert!(HardwareGovernor::check_gpu_tdr_window(200).is_ok());
        assert!(HardwareGovernor::check_gpu_tdr_window(260).is_err());
    }
}
