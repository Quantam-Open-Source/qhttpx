fn debug_type() {
    let schema: () = jsonschema::validator_for(&serde_json::Value::Null).unwrap();
}
