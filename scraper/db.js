import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export async function upsertProfessor(prof) {
  const { data, error } = await supabase
    .from("professors")
    .upsert(
      {
        culpa_id:     prof.culpa_id,
        first_name:   prof.first_name,
        last_name:    prof.last_name,
        nugget:       prof.nugget || "None",
        review_count: prof.review_count || 0,
        culpa_url:    prof.culpa_url,
        updated_at:   new Date().toISOString(),
      },
      { onConflict: "culpa_id" }
    )
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

export async function upsertReviews(professorId, reviews) {
  if (!reviews?.length) return;

  // Clear old reviews for this professor and re-insert
  await supabase.from("reviews").delete().eq("professor_id", professorId);

  const rows = reviews.map(r => ({
    professor_id: professorId,
    review_text:  r.text,
    workload:     r.workload || null,
    review_date:  r.date || null,
  }));

  const { error } = await supabase.from("reviews").insert(rows);
  if (error) throw error;
}

export async function lookupProfessor(firstName, lastName) {
  const { data, error } = await supabase
    .from("professors")
    .select(`*, reviews(review_text, workload, review_date)`)
    .ilike("last_name", lastName)
    .ilike("first_name", `${firstName}%`)
    .limit(1)
    .single();

  if (error) return null;
  return data;
}
