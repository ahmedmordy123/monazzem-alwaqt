use crate::storage::Language;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TrayLabels {
    pub show: &'static str,
    pub pause: &'static str,
    pub resume: &'static str,
    pub reset: &'static str,
    pub mode: &'static str,
    pub quit: &'static str,
}

pub fn tray_labels(language: Language) -> TrayLabels {
    match language {
        Language::Ar => TrayLabels {
            show: "إظهار",
            pause: "إيقاف مؤقت",
            resume: "استئناف",
            reset: "إعادة ضبط",
            mode: "تبديل النمط",
            quit: "خروج",
        },
        Language::En => TrayLabels {
            show: "Show",
            pause: "Pause",
            resume: "Resume",
            reset: "Reset",
            mode: "Toggle mode",
            quit: "Quit",
        },
    }
}

pub fn remaining_time_text(language: Language, remaining_ms: u64) -> String {
    let total_seconds = (remaining_ms.saturating_add(999)) / 1_000;
    let minutes = total_seconds / 60;
    let seconds = total_seconds % 60;
    match language {
        Language::Ar => format!("المتبقي {minutes:02}:{seconds:02}"),
        Language::En => format!("Remaining {minutes:02}:{seconds:02}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats_remaining_time_in_both_languages() {
        assert_eq!(remaining_time_text(Language::En, 61_001), "Remaining 01:02");
        assert_eq!(remaining_time_text(Language::Ar, 1_000), "المتبقي 00:01");
    }

    #[test]
    fn returns_localized_tray_labels() {
        assert_eq!(tray_labels(Language::En).quit, "Quit");
        assert_eq!(tray_labels(Language::Ar).reset, "إعادة ضبط");
    }
}
