import { Path, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
import { LOGO_PATHS, LOGO_VIEWBOX } from "@/lib/brand-art";
import { site } from "@/lib/site";

/**
 * The letterhead lockup, shared by every document we issue.
 *
 * It mirrors the web lockup deliberately: QONIC · cube · consulting on one
 * baseline with the rule-flanked tagline beneath. Earlier the documents set
 * "consulting" in grey and undersized the mark, so a letter and the website
 * looked like two different companies.
 *
 * Both words are the same black. The mark is sized off the wordmark (17.6pt to
 * the wordmark's 16pt, the 1.1em the site uses) so the proportions hold if the
 * letterhead size ever changes.
 */
const styles = StyleSheet.create({
  lockup: { flexDirection: "column", alignItems: "center" },
  words: { flexDirection: "row", alignItems: "center", gap: 5 },
  word: { fontSize: 16, fontWeight: 700, color: "#111111", letterSpacing: 0.2 },
  wordSoft: { fontSize: 16, fontWeight: 400, color: "#111111" },
  mark: { width: 16.7, height: 17.6 },
  tagline: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 3, width: "100%" },
  taglineText: { fontSize: 6.5, color: "#8a6a08", letterSpacing: 0.9 },
  // The rules flex so they always meet the text, as on the site.
  rule: { flexGrow: 1, height: 1, backgroundColor: "#8a6a08" },
});

export function PdfLockup() {
  return (
    <View style={styles.lockup}>
      <View style={styles.words}>
        <Text style={styles.word}>QONIC</Text>
        <Svg viewBox={LOGO_VIEWBOX} style={styles.mark}>
          {LOGO_PATHS.map((d) => <Path key={d} d={d} fill={site.brand.mark} />)}
        </Svg>
        <Text style={styles.wordSoft}>consulting</Text>
      </View>
      <View style={styles.tagline}>
        <View style={styles.rule} />
        <Text style={styles.taglineText}>{site.tagline}</Text>
        <View style={styles.rule} />
      </View>
    </View>
  );
}
