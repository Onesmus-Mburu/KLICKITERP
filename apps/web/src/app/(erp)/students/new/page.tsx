"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StudentForm } from "@/features/students/components/student-form";

export default function NewStudentPage() {
  const t = useTranslations("students");

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/students">
          <ArrowLeft className="size-4" />
          {t("detail.backToList")}
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("newStudent")}</CardTitle>
        </CardHeader>
        <CardContent>
          <StudentForm mode="create" />
        </CardContent>
      </Card>
    </div>
  );
}
