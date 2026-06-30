declare global {
  interface Map<K, V> {
    getOrInsertComputed?(key: K, callback: () => V): V
  }
}

if (!Map.prototype.getOrInsertComputed) {
  Map.prototype.getOrInsertComputed = function getOrInsertComputed<K, V>(this: Map<K, V>, key: K, callback: () => V) {
    if (this.has(key)) return this.get(key) as V

    const value = callback()
    this.set(key, value)
    return value
  }
}

export {}
