"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { StudentForm } from "@/features/students/components/student-form";
import { useStudent } from "@/features/students/hooks/use-students";

export default function EditStudentPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("students");
  const studentQuery = useStudent(id);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href={`/students/${id}`}>
          <ArrowLeft className="size-4" />
          {t("detail.backToList")}
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("form.editTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <QueryBoundary query={studentQuery}>{(student) => <StudentForm mode="edit" student={student} />}</QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
