use std::{
    fs::{self, OpenOptions},
    io::{self, Write},
    path::{Path, PathBuf},
};

#[derive(Debug, Clone)]
pub struct RotatingFileLog {
    path: PathBuf,
    max_bytes: u64,
}

impl RotatingFileLog {
    pub fn new(path: PathBuf, max_bytes: u64) -> Self {
        Self { path, max_bytes }
    }

    pub fn append(&self, line: impl AsRef<str>) -> io::Result<()> {
        rotate_if_needed(&self.path, self.max_bytes)?;
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)?;
        }
        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.path)?;
        writeln!(file, "{}", line.as_ref())?;
        Ok(())
    }
}

fn rotate_if_needed(path: &Path, max_bytes: u64) -> io::Result<()> {
    if max_bytes == 0 || !path.exists() {
        return Ok(());
    }
    let metadata = fs::metadata(path)?;
    if metadata.len() < max_bytes {
        return Ok(());
    }
    let rotated = PathBuf::from(format!("{}.1", path.display()));
    if rotated.exists() {
        fs::remove_file(&rotated)?;
    }
    fs::rename(path, rotated)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn rotates_when_size_limit_is_reached() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("app.log");
        let log = RotatingFileLog::new(path.clone(), 8);

        log.append("12345678").unwrap();
        log.append("next").unwrap();

        assert!(path.exists());
        assert!(PathBuf::from(format!("{}.1", path.display())).exists());
    }
}
