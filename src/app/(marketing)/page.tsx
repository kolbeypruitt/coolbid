import Link from "next/link";
import { Upload, Zap, FileText, DollarSign } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

const features = [
  {
    icon: Upload,
    title: "Upload Floorplans",
    description:
      "Upload PDF or image floorplans directly from your browser — any format works.",
  },
  {
    icon: Zap,
    title: "AI Room Analysis",
    description:
      "Claude Vision reads your floorplan and automatically identifies rooms, sizes, and layout.",
  },
  {
    icon: FileText,
    title: "Instant BOM",
    description:
      "Get a complete bill of materials with equipment, ducts, and supplies generated in seconds.",
  },
  {
    icon: DollarSign,
    title: "Professional Quotes",
    description:
      "Produce polished, itemized estimates with your margin baked in — ready to send.",
  },
];

export default function LandingPage() {
  return (
    <main className="flex-1">
      {/* Hero */}
      <section className="mx-auto max-w-4xl px-6 py-24 text-center space-y-6">
        <h1 className="text-4xl sm:text-5xl font-bold leading-tight">
          HVAC Estimates in Minutes, Not Hours
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Upload a floorplan, let AI analyze the rooms, and get a complete bill
          of materials and customer-ready quote — all in one workflow.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/auth/register"
            className={cn(buttonVariants({ size: "lg" }))}
          >
            Start Free Trial
          </Link>
          <Link
            href="/auth/login"
            className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
          >
            Sign In
          </Link>
        </div>
        <p className="text-sm text-muted-foreground">
          14-day free trial. No credit card required.
        </p>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-5xl px-6 pb-24">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {features.map(({ icon: Icon, title, description }) => (
            <Card key={title}>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <Icon className="h-5 w-5 text-primary" />
                  <CardTitle>{title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription>{description}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="border-t bg-muted/40">
        <div className="mx-auto max-w-3xl px-6 py-20 text-center space-y-6">
          <h2 className="text-3xl font-bold">
            Ready to speed up your estimates?
          </h2>
          <Link
            href="/auth/register"
            className={cn(buttonVariants({ size: "lg" }))}
          >
            Get Started Free
          </Link>
        </div>
      </section>
    </main>
  );
}
