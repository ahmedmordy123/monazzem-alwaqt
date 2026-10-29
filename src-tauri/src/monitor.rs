//! Monitor identification by geometry fingerprint (not only OS id).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MonitorInfo {
    pub id: String,
    pub width: u32,
    pub height: u32,
    pub scale: f64,
    pub x: i32,
    pub y: i32,
    pub is_primary: bool,
}

impl MonitorInfo {
    pub fn fingerprint_key(&self) -> String {
        format!(
            "{}x{}@{}:{};{}",
            self.width,
            self.height,
            (self.scale * 100.0).round() as i32,
            self.x,
            self.y
        )
    }
}

/// Score a candidate against a remembered target. Lower is better.
pub fn score_match(target: &MonitorInfo, candidate: &MonitorInfo) -> f64 {
    let mut score = 0.0;
    score += (target.width as i64 - candidate.width as i64).unsigned_abs() as f64;
    score += (target.height as i64 - candidate.height as i64).unsigned_abs() as f64;
    score += (target.scale - candidate.scale).abs() * 200.0;
    score += (target.x as i64 - candidate.x as i64).unsigned_abs() as f64 * 0.05;
    score += (target.y as i64 - candidate.y as i64).unsigned_abs() as f64 * 0.05;
    if target.id == candidate.id {
        score *= 0.5;
    }
    score
}

/// Pick closest monitor to the remembered target. If `target_key` is a fingerprint
/// string, match on geometry; if it equals an id, prefer that id.
pub fn match_target<'a>(
    monitors: &'a [MonitorInfo],
    target_key: Option<&str>,
    remembered: Option<&MonitorInfo>,
) -> Option<&'a MonitorInfo> {
    if monitors.is_empty() {
        return None;
    }
    if let Some(key) = target_key {
        if let Some(by_id) = monitors.iter().find(|m| m.id == key) {
            return Some(by_id);
        }
        if let Some(by_fp) = monitors.iter().find(|m| m.fingerprint_key() == key) {
            return Some(by_fp);
        }
    }
    if let Some(rem) = remembered {
        return monitors.iter().min_by(|a, b| {
            let sa = score_match(rem, a);
            let sb = score_match(rem, b);
            sa.partial_cmp(&sb).unwrap_or(std::cmp::Ordering::Equal)
        });
    }
    monitors.iter().find(|m| m.is_primary).or(monitors.first())
}

/// When target disappears → primary; when it reappears → restore.
pub fn resolve_after_display_change<'a>(
    monitors: &'a [MonitorInfo],
    preferred_key: Option<&str>,
    remembered: Option<&MonitorInfo>,
) -> Option<&'a MonitorInfo> {
    if let Some(key) = preferred_key {
        if let Some(m) = monitors.iter().find(|m| m.id == key || m.fingerprint_key() == key) {
            return Some(m);
        }
    }
    if let Some(rem) = remembered {
        let best = match_target(monitors, None, Some(rem))?;
        // If closest is wildly different (e.g. only primary left), still return it.
        return Some(best);
    }
    monitors.iter().find(|m| m.is_primary).or(monitors.first())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn m(
        id: &str,
        w: u32,
        h: u32,
        scale: f64,
        x: i32,
        y: i32,
        primary: bool,
    ) -> MonitorInfo {
        MonitorInfo {
            id: id.into(),
            width: w,
            height: h,
            scale,
            x,
            y,
            is_primary: primary,
        }
    }

    #[test]
    fn matches_by_fingerprint_when_id_changes() {
        let tablet = m("spacedesk-1", 1920, 1200, 1.5, 1920, 0, false);
        let primary = m("main", 2560, 1440, 1.0, 0, 0, true);
        let monitors = vec![primary.clone(), tablet.clone()];
        let key = tablet.fingerprint_key();

        // Same geometry, new OS id (common after Spacedesk reconnect)
        let tablet2 = m("spacedesk-99", 1920, 1200, 1.5, 1920, 0, false);
        let after = vec![primary.clone(), tablet2.clone()];
        let found = match_target(&after, Some(&key), Some(&tablet)).unwrap();
        assert_eq!(found.width, 1920);
        assert_eq!(found.id, "spacedesk-99");
        let _ = monitors;
    }

    #[test]
    fn falls_back_to_primary_when_target_removed() {
        let tablet = m("spacedesk-1", 1920, 1200, 1.5, 1920, 0, false);
        let primary = m("main", 2560, 1440, 1.0, 0, 0, true);
        let only_primary = vec![primary.clone()];
        let found =
            resolve_after_display_change(&only_primary, Some(&tablet.fingerprint_key()), Some(&tablet))
                .unwrap();
        assert!(found.is_primary);
    }

    #[test]
    fn returns_to_tablet_when_reappears() {
        let tablet = m("spacedesk-1", 1920, 1200, 1.5, 1920, 0, false);
        let primary = m("main", 2560, 1440, 1.0, 0, 0, true);
        let key = tablet.fingerprint_key();
        let both = vec![primary, tablet.clone()];
        let found = resolve_after_display_change(&both, Some(&key), Some(&tablet)).unwrap();
        assert_eq!(found.fingerprint_key(), key);
    }

    #[test]
    fn closest_match_on_resolution_change() {
        let remembered = m("t", 1920, 1200, 1.5, 1920, 0, false);
        let primary = m("main", 2560, 1440, 1.0, 0, 0, true);
        // Tablet rotated / slight res change
        let tablet = m("t2", 1200, 1920, 1.5, 2560, 0, false);
        let near = m("near", 1920, 1080, 1.5, 1920, 0, false);
        let monitors = vec![primary, tablet, near.clone()];
        let found = match_target(&monitors, None, Some(&remembered)).unwrap();
        assert_eq!(found.id, "near");
    }
}
