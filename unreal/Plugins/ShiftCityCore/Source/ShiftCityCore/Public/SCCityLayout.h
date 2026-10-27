// Shared Shift City layout: the road grid and the ten named places (port of the browser's data/world.ts).
// Used by the city generator, traffic and anything else that needs to know where roads are.
#pragma once

#include "CoreMinimal.h"

// Layout constants in centimetres (browser metres x 100). Browser (x, z) maps to Unreal (X, Y), height = Z.
namespace SC
{
	constexpr int32 Grid = 10;
	constexpr float Pitch = 6400.f;
	constexpr float Half = Grid * Pitch / 2.f;
	constexpr float RoadW = 1400.f;
	constexpr float HW = RoadW / 2.f;
	constexpr float LaneW = 350.f;
	constexpr float Walk = 400.f;
	constexpr float KerbH = 15.f;
	inline float Road(int32 K) { return -Half + K * Pitch; }

	struct FDest { const TCHAR* Name; bool bAxisX; int32 I, J, Side; const TCHAR* Landmark; };
	// Same ten places as the browser version (data/world.ts)
	const FDest Dests[] = {
		{ TEXT("Central Station"), true, 4, 2, 1, TEXT("station") },
		{ TEXT("Riverside Apartments"), false, 7, 8, -1, TEXT("apartments") },
		{ TEXT("City Hospital"), true, 2, 7, -1, TEXT("hospital") },
		{ TEXT("Westside Mall"), false, 3, 1, 1, TEXT("mall") },
		{ TEXT("University Quarter"), true, 6, 1, 1, TEXT("campus") },
		{ TEXT("Harbour Hotel"), false, 5, 9, 1, TEXT("hotel") },
		{ TEXT("Market Square"), true, 4, 7, 1, TEXT("market") },
		{ TEXT("Old Town"), false, 8, 6, -1, TEXT("oldtown") },
		{ TEXT("South Park"), true, 1, 9, -1, TEXT("park") },
		{ TEXT("Arts District"), false, 5, 5, -1, TEXT("arts") },
	};
	/** Building height (cm) and facade style for each landmark. */
	inline void LandmarkSpec(const FString& L, float& OutH, int32& OutStyle)
	{
		struct FSpec { const TCHAR* Name; float H; int32 Style; };
		static const FSpec Specs[] = {
			{ TEXT("station"), 1600.f, 0 }, { TEXT("apartments"), 4200.f, 3 }, { TEXT("hospital"), 3400.f, 3 },
			{ TEXT("mall"), 1400.f, 4 }, { TEXT("campus"), 1800.f, 1 }, { TEXT("hotel"), 9600.f, 2 },
			{ TEXT("market"), 900.f, 5 }, { TEXT("oldtown"), 1200.f, 1 }, { TEXT("arts"), 2000.f, 5 } };
		for (const FSpec& Sp : Specs) if (L == Sp.Name) { OutH = Sp.H; OutStyle = Sp.Style; return; }
	}

	inline FVector DestPos(const FDest& D)
	{
		const float Along = Road(D.I) + Pitch / 2.f, Across = Road(D.J) + D.Side * (HW - LaneW / 2.f);
		return D.bAxisX ? FVector(Along, Across, 0.f) : FVector(Across, Along, 0.f);
	}

	/** Grid node (road intersection) position, i/j in 0..Grid. */
	inline FVector NodePos(int32 I, int32 J) { return FVector(Road(I), Road(J), 0.f); }

	// ---------------------------------------------------------------- road routing (port of RoadNetwork.ts)
	constexpr int32 Nodes = (Grid + 1) * (Grid + 1);
	inline int32 NodeIndex(int32 I, int32 J) { return J * (Grid + 1) + I; }
	inline FVector NodeAt(int32 Id) { return NodePos(Id % (Grid + 1), Id / (Grid + 1)); }

	struct FSegment { int32 A = 0, B = 1; };

	/** Closest road segment to a point, and the point projected onto its centre-line. */
	inline FSegment NearestSegment(const FVector& P, FVector& OutProj)
	{
		const int32 Ki = FMath::Clamp(FMath::RoundToInt((P.X - Road(0)) / Pitch), 0, Grid);
		const int32 Kj = FMath::Clamp(FMath::RoundToInt((P.Y - Road(0)) / Pitch), 0, Grid);
		const float DX = FMath::Abs(P.X - Road(Ki)), DY = FMath::Abs(P.Y - Road(Kj));
		FSegment S;
		if (DY <= DX)
		{
			const int32 I = FMath::Clamp(FMath::FloorToInt((P.X - Road(0)) / Pitch), 0, Grid - 1);
			S.A = NodeIndex(I, Kj); S.B = NodeIndex(I + 1, Kj);
			OutProj = FVector(FMath::Clamp(P.X, Road(0), Road(Grid)), Road(Kj), 0.f);
		}
		else
		{
			const int32 J = FMath::Clamp(FMath::FloorToInt((P.Y - Road(0)) / Pitch), 0, Grid - 1);
			S.A = NodeIndex(Ki, J); S.B = NodeIndex(Ki, J + 1);
			OutProj = FVector(Road(Ki), FMath::Clamp(P.Y, Road(0), Road(Grid)), 0.f);
		}
		return S;
	}

	enum class ETurn : uint8 { Straight, Left, Right, UTurn, Arrive };

	struct FRoute
	{
		TArray<FVector> Points;
		float Length = 0.f;
		ETurn Next = ETurn::Arrive;
		float NextDist = 0.f; // cm to the next turn (or to arrival)
	};

	/** Shortest path along the roads from From (facing Heading) to To. */
	inline FRoute FindRoute(const FVector& From, const FVector& Heading, const FVector& To)
	{
		FRoute R;
		FVector Proj, ToProj;
		const FSegment Seg = NearestSegment(From, Proj);
		const FSegment TSeg = NearestSegment(To, ToProj);
		TArray<FVector> Pts = { From, Proj };
		const bool bSame = (Seg.A == TSeg.A && Seg.B == TSeg.B);
		if (!bSame)
		{
			float Cost[Nodes]; int32 Prev[Nodes]; bool Done[Nodes];
			for (int32 i = 0; i < Nodes; ++i) { Cost[i] = 1e12f; Prev[i] = -1; Done[i] = false; }
			for (int32 Nd : { Seg.A, Seg.B })
			{
				Cost[Nd] = FVector::Dist2D(Proj, NodeAt(Nd));
				if (FVector::DotProduct(NodeAt(Nd) - Proj, Heading) < 0.f) Cost[Nd] += 2500.f; // prefer driving forward
			}
			for (;;)
			{
				int32 U = -1; float Best = 1e12f;
				for (int32 k = 0; k < Nodes; ++k) if (!Done[k] && Cost[k] < Best) { Best = Cost[k]; U = k; }
				if (U < 0) break;
				Done[U] = true;
				if (Done[TSeg.A] && Done[TSeg.B]) break;
				const int32 I = U % (Grid + 1), J = U / (Grid + 1);
				const int32 Nb[4] = { I > 0 ? U - 1 : -1, I < Grid ? U + 1 : -1, J > 0 ? U - (Grid + 1) : -1, J < Grid ? U + (Grid + 1) : -1 };
				for (int32 V : Nb) if (V >= 0 && Cost[U] + Pitch < Cost[V]) { Cost[V] = Cost[U] + Pitch; Prev[V] = U; }
			}
			int32 End = (Cost[TSeg.A] + FVector::Dist2D(NodeAt(TSeg.A), To) <= Cost[TSeg.B] + FVector::Dist2D(NodeAt(TSeg.B), To)) ? TSeg.A : TSeg.B;
			TArray<FVector> Chain;
			for (int32 Nd = End; Nd >= 0; Nd = Prev[Nd]) Chain.Insert(NodeAt(Nd), 0);
			Pts.Append(Chain);
		}
		Pts.Add(To);
		for (const FVector& P : Pts) if (R.Points.Num() == 0 || FVector::Dist2D(P, R.Points.Last()) > 50.f) R.Points.Add(FVector(P.X, P.Y, 0.f));
		for (int32 i = 1; i < R.Points.Num(); ++i) R.Length += FVector::Dist2D(R.Points[i - 1], R.Points[i]);
		// next turn: first junction on the route where the direction changes
		float Acc = 0.f;
		R.Next = ETurn::Arrive; R.NextDist = R.Length;
		auto OnGrid = [](float V) { const float M = FMath::Fmod(V - Road(0), Pitch); return FMath::Abs(M) < 1.f || FMath::Abs(M - Pitch) < 1.f; };
		for (int32 i = 1; i + 1 < R.Points.Num(); ++i)
		{
			Acc += FVector::Dist2D(R.Points[i - 1], R.Points[i]);
			if (!OnGrid(R.Points[i].X) || !OnGrid(R.Points[i].Y)) continue;
			const FVector D1 = (R.Points[i] - R.Points[i - 1]).GetSafeNormal2D(), D2 = (R.Points[i + 1] - R.Points[i]).GetSafeNormal2D();
			const float Cross = D1.X * D2.Y - D1.Y * D2.X, Dot = D1.X * D2.X + D1.Y * D2.Y;
			if (Dot < -0.7f) { R.Next = ETurn::UTurn; R.NextDist = Acc; break; }
			if (FMath::Abs(Cross) > 0.7f) { R.Next = Cross > 0.f ? ETurn::Right : ETurn::Left; R.NextDist = Acc; break; } // Unreal axes: +X to +Y is a right turn
		}
		return R;
	}
}
