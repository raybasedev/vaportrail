use std::collections::BTreeSet;
use tailwindcss_oxide::extractor::{Extracted, Extractor};
use tailwindcss_oxide::scanner::pre_process_input;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn scan_content_json(content: &str, extension: Option<String>) -> Result<String, JsValue> {
    let extension = extension.unwrap_or_else(|| "html".to_string());
    let processed = pre_process_input(content.as_bytes().to_vec(), &extension);
    let mut extractor = Extractor::new(&processed);
    let mut candidates = BTreeSet::new();

    for item in extractor.extract() {
        if let Extracted::Candidate(bytes) = item {
            let candidate = std::str::from_utf8(bytes)
                .map_err(|err| JsValue::from_str(&format!("invalid UTF-8 candidate: {err}")))?;
            candidates.insert(candidate.to_string());
        }
    }

    serde_json::to_string(&candidates.into_iter().collect::<Vec<_>>())
        .map_err(|err| JsValue::from_str(&format!("failed to serialize candidates: {err}")))
}
